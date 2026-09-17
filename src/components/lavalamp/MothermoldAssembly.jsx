import { useEffect, useRef, useState } from 'react';

const PARTS = {
  'master_with_lugs.stl': { color: [.84, .42, .24], direction: [0, 0, 0] },
  'jacket_front.stl': { color: [.30, .48, .38], direction: [0, 1, 0] },
  'jacket_back.stl': { color: [.46, .66, .55], direction: [0, -1, 0] },
  'lid.stl': { color: [.84, .64, .29], direction: [0, 0, -1] },
  'displacement_core.stl': { color: [.44, .54, .71], direction: [0, 0, 1] },
};

const smoothstep = value => value * value * (3 - 2 * value);

function sequenceProgress(elapsed) {
  const cycle = (elapsed % 5.6) / 5.6;
  if (cycle < .09) return 0;
  if (cycle < .48) return (cycle - .09) / .39;
  if (cycle < .64) return 1;
  if (cycle < .94) return 1 - (cycle - .64) / .30;
  return 0;
}

function parseSTL(buffer) {
  const view = new DataView(buffer);
  const triangles = view.getUint32(80, true);
  const positions = new Float32Array(triangles * 9);
  const normals = new Float32Array(triangles * 9);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let offset = 84;
  let index = 0;

  for (let triangle = 0; triangle < triangles; triangle += 1, offset += 50) {
    const normal = [
      view.getFloat32(offset, true),
      view.getFloat32(offset + 4, true),
      view.getFloat32(offset + 8, true),
    ];
    for (let vertex = 0; vertex < 3; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = view.getFloat32(offset + 12 + vertex * 12 + axis * 4, true);
        positions[index] = value;
        normals[index] = normal[axis];
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
        index += 1;
      }
    }
  }

  return { positions, normals, count: triangles * 3, min, max };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || 'Mothermold preview shader could not compile.');
  }
  return shader;
}

export default function MothermoldAssembly({ fallback, label }) {
  const canvasRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (!gl) {
      setFailed(true);
      return undefined;
    }

    const controller = new AbortController();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const vertexSource = `attribute vec3 p;attribute vec3 n;uniform mat4 proj;uniform vec3 center;uniform vec3 offset;uniform vec2 turn;uniform vec2 frameOffset;uniform float zoom;uniform float distance;varying float light;void main(){vec3 q=p-center+offset;float cz=cos(turn.x),sz=sin(turn.x),cx=cos(turn.y),sx=sin(turn.y);q=vec3(cz*q.x-sz*q.y,sz*q.x+cz*q.y,q.z);q=vec3(q.x,cx*q.y-sx*q.z,sx*q.y+cx*q.z);q=vec3(q.x,q.z,-q.y);vec3 rotatedNormal=vec3(cz*n.x-sz*n.y,sz*n.x+cz*n.y,n.z);rotatedNormal=vec3(rotatedNormal.x,cx*rotatedNormal.y-sx*rotatedNormal.z,sx*rotatedNormal.y+cx*rotatedNormal.z);vec3 studioNormal=vec3(rotatedNormal.x,rotatedNormal.z,-rotatedNormal.y);float oldLight=.34+.66*max(dot(normalize(rotatedNormal),normalize(vec3(.4,-.6,.75))),0.);float studioLight=.30+.70*max(dot(normalize(studioNormal),normalize(vec3(.4,.7,.8))),0.);float blendedLight=mix(oldLight,studioLight,.5);light=.46+.42*blendedLight;q*=zoom;q.z-=distance;gl_Position=proj*vec4(q,1.);gl_Position.xy+=frameOffset*gl_Position.w;}`;
    const fragmentSource = `precision mediump float;uniform vec3 color;varying float light;void main(){gl_FragColor=vec4(color*light,1.);}`;
    let animationFrame = 0;
    let program;
    let meshes = [];
    const loadedMeshes = [];
    let disposed = false;

    async function start() {
      const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);

      const locations = {
        position: gl.getAttribLocation(program, 'p'),
        normal: gl.getAttribLocation(program, 'n'),
        projection: gl.getUniformLocation(program, 'proj'),
        center: gl.getUniformLocation(program, 'center'),
        offset: gl.getUniformLocation(program, 'offset'),
        frameOffset: gl.getUniformLocation(program, 'frameOffset'),
        zoom: gl.getUniformLocation(program, 'zoom'),
        distance: gl.getUniformLocation(program, 'distance'),
        turn: gl.getUniformLocation(program, 'turn'),
        color: gl.getUniformLocation(program, 'color'),
      };

      meshes = await Promise.all(Object.entries(PARTS).map(async ([name, spec]) => {
        const response = await fetch(`/projects/mothermold/master8/${name}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Could not load ${name}.`);
        const mesh = parseSTL(await response.arrayBuffer());
        const position = gl.createBuffer();
        const normal = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, position);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, normal);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
        const loadedMesh = { ...spec, count: mesh.count, min: mesh.min, max: mesh.max, position, normal };
        loadedMeshes.push(loadedMesh);
        return loadedMesh;
      }));
      if (disposed) return;

      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      meshes.forEach(mesh => {
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], mesh.min[axis]);
          max[axis] = Math.max(max[axis], mesh.max[axis]);
        }
      });
      const center = min.map((value, axis) => (value + max[axis]) / 2);
      const maximumDimension = Math.max(...max.map((value, axis) => value - min[axis]));
      const cameraDistance = Math.max(390, maximumDimension * 1.65);

      const bind = mesh => {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.position);
        gl.enableVertexAttribArray(locations.position);
        gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normal);
        gl.enableVertexAttribArray(locations.normal);
        gl.vertexAttribPointer(locations.normal, 3, gl.FLOAT, false, 0, 0);
      };

      let elapsed = 0;
      let previousTime = performance.now();
      canvas.classList.add('is-ready');

      const draw = now => {
        if (disposed) return;
        const delta = Math.min((now - previousTime) / 1000, .05);
        previousTime = now;
        if (!document.hidden && !reducedMotion.matches) elapsed += delta;

        const eased = reducedMotion.matches ? 42 / 62 : smoothstep(sequenceProgress(elapsed));
        const explode = 62 * eased;
        const yaw = .65 + Math.PI / 2 + Math.PI * eased;
        const pitch = .58;
        const density = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(canvas.clientWidth * density));
        const height = Math.max(1, Math.round(canvas.clientHeight * density));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        const aspect = width / height;
        const focal = 1 / Math.tan(Math.PI / 7);
        const near = .1;
        const far = 3000;
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.uniformMatrix4fv(locations.projection, false, new Float32Array([
          focal / aspect, 0, 0, 0,
          0, focal, 0, 0,
          0, 0, (far + near) / (near - far), -1,
          0, 0, 2 * far * near / (near - far), 0,
        ]));
        const narrow = canvas.clientWidth < 600;
        const startZoom = narrow ? 1.48 : 1.35;
        const endZoom = narrow ? .84 : .90;
        const widestAnglePullback = (narrow ? .20 : .24) * Math.sin(Math.PI * eased);
        gl.uniform3fv(locations.center, center);
        gl.uniform2f(locations.frameOffset, narrow ? 0 : -.07, -.055);
        gl.uniform1f(locations.zoom, startZoom + (endZoom - startZoom) * eased - widestAnglePullback);
        gl.uniform1f(locations.distance, cameraDistance);
        gl.uniform2f(locations.turn, yaw, pitch);

        meshes.forEach(mesh => {
          gl.uniform3fv(locations.color, mesh.color);
          gl.uniform3f(locations.offset, mesh.direction[0] * explode, mesh.direction[1] * explode, mesh.direction[2] * explode);
          bind(mesh);
          gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        });
        animationFrame = requestAnimationFrame(draw);
      };

      animationFrame = requestAnimationFrame(draw);
    }

    start().catch(error => {
      if (error.name !== 'AbortError' && !disposed) setFailed(true);
    });

    return () => {
      disposed = true;
      controller.abort();
      cancelAnimationFrame(animationFrame);
      loadedMeshes.forEach(mesh => {
        gl.deleteBuffer(mesh.position);
        gl.deleteBuffer(mesh.normal);
      });
      if (program) gl.deleteProgram(program);
    };
  }, []);

  return <div className={`mothermold-assembly${failed ? ' is-failed' : ''}`}>
    {failed && <img src={fallback} alt={label} decoding="async" />}
    <canvas ref={canvasRef} hidden={failed} role="img" aria-label={label} />
  </div>;
}
