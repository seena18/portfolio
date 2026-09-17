// Depth/normal screen-space outlines. Geometry remains full resolution; the
// shaded source can be composited with edges or replaced by a plain backdrop.
import * as THREE from 'three';

export function createScreenSpaceOutline(renderer) {
  const color = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
  });
  color.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  color.depthTexture.minFilter = color.depthTexture.magFilter = THREE.NearestFilter;
  const normal = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
  });
  const albedo = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true,
  });
  const normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  const unlitCache = new WeakMap(), unlitMaterials = new Set();
  function unlit(material) {
    if (Array.isArray(material)) return material.map(unlit);
    let basic = unlitCache.get(material);
    if (!basic) {
      basic = new THREE.MeshBasicMaterial({
        map: material.map || null, color: material.color || 0xffffff,
        vertexColors: !!material.vertexColors, side: THREE.DoubleSide,
        alphaMap: material.alphaMap || null, alphaTest: material.alphaTest || 0,
        transparent: !!material.transparent, opacity: material.opacity ?? 1,
      });
      basic.toneMapped = false;
      unlitCache.set(material, basic); unlitMaterials.add(basic);
    }
    return basic;
  }
  const uniforms = {
    tColor: { value: color.texture }, tDepth: { value: color.depthTexture },
    tNormal: { value: normal.texture }, tAlbedo: { value: albedo.texture },
    texel: { value: new THREE.Vector2(1, 1) },
    nearPlane: { value: 0.01 }, farPlane: { value: 200 },
    thickness: { value: 1 }, depthThreshold: { value: 0.025 },
    normalThreshold: { value: 0.01 }, tonalThreshold: { value: 0 },
    stableDensity: { value: 1 }, pixelRatio: { value: 1 }, projectedHeight: { value: 800 },
    lineFinish: { value: 0 },
    edgeColor: { value: new THREE.Color(0x171717) },
    backdropColor: { value: new THREE.Color(0xfbfaf7) }, outlineOnly: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 uvScreen;
      void main() { uvScreen = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tColor, tDepth, tNormal, tAlbedo;
      uniform vec2 texel;
      uniform float nearPlane, farPlane, thickness, depthThreshold, normalThreshold, tonalThreshold, outlineOnly, lineFinish;
      uniform float stableDensity, pixelRatio, projectedHeight;
      uniform vec3 edgeColor, backdropColor;
      varying vec2 uvScreen;

      float linearDepth(float z) {
        return nearPlane * farPlane / (farPlane - (farPlane - nearPlane) * z);
      }
      vec3 surfaceNormal(vec2 uv) {
        vec2 r = texel * pixelRatio * 0.85;
        vec3 n = texture2D(tNormal, uv).xyz * 4.0;
        n += texture2D(tNormal, uv + vec2(r.x, 0.0)).xyz;
        n += texture2D(tNormal, uv - vec2(r.x, 0.0)).xyz;
        n += texture2D(tNormal, uv + vec2(0.0, r.y)).xyz;
        n += texture2D(tNormal, uv - vec2(0.0, r.y)).xyz;
        return normalize(n * 0.25 - 1.0);
      }
      float edgeLuma(vec3 rgb) {
        return dot(rgb, vec3(0.2126, 0.7152, 0.0722));
      }
      float filteredLuma(vec2 uv) {
        // Filter texture noise at every zoom, before finding facial edges.
        // A small on-screen bust needs a wider low-pass footprint; otherwise
        // several texture marks collapse into the same dark pixel cluster.
        float smallPortrait = 1.0 - smoothstep(150.0, 440.0, projectedHeight);
        vec2 r = texel * pixelRatio * mix(1.15, 2.5, smallPortrait);
        float sum = edgeLuma(texture2D(tAlbedo, uv).rgb) * 4.0;
        sum += edgeLuma(texture2D(tAlbedo, uv + vec2(r.x, 0.0)).rgb);
        sum += edgeLuma(texture2D(tAlbedo, uv - vec2(r.x, 0.0)).rgb);
        sum += edgeLuma(texture2D(tAlbedo, uv + vec2(0.0, r.y)).rgb);
        sum += edgeLuma(texture2D(tAlbedo, uv - vec2(0.0, r.y)).rgb);
        return sum * 0.125;
      }
      void main() {
        vec4 base = texture2D(tColor, uvScreen);
        float centerLuma = tonalThreshold > 0.0 ? filteredLuma(uvScreen) : 0.0;
        float centerRaw = texture2D(tDepth, uvScreen).r;
        float center = linearDepth(centerRaw);
        vec3 nCenter = surfaceNormal(uvScreen);
        float normalCut = normalThreshold;
        float tonalCut = tonalThreshold;
        float depthCut = depthThreshold;
        float smallPortrait = stableDensity > 0.5
          ? 1.0 - smoothstep(150.0, 440.0, projectedHeight)
          : 0.0;
        if (stableDensity > 0.5) {
          // Keep the outer silhouette at every size, but progressively omit
          // sub-pixel folds, pores, and texture edges as the bust recedes.
          normalCut *= mix(1.0, 4.5, smallPortrait);
          tonalCut *= mix(1.0, 3.8, smallPortrait);
          depthCut *= mix(1.0, 2.2, smallPortrait);
        }
        float edge = 0.0;
        for (int x = -1; x <= 1; x++) {
          for (int y = -1; y <= 1; y++) {
            if (x == 0 && y == 0) continue;
            vec2 sampleUV = clamp(uvScreen + vec2(float(x), float(y)) * texel * thickness * pixelRatio,
                                  texel * 0.5, vec2(1.0) - texel * 0.5);
            float otherRaw = texture2D(tDepth, sampleUV).r;
            bool subject = centerRaw < 0.999999;
            bool other = otherRaw < 0.999999;
            if (subject != other) {
              edge = 1.0;
            } else if (subject && other) {
              float farDepth = linearDepth(otherRaw);
              float relativeGap = abs(center - farDepth) / max(min(center, farDepth), 0.001);
              float depthEdge = smoothstep(depthCut * 0.5, depthCut * 1.5, relativeGap);
              // Facial detail has its own fixed footprint; thicker silhouettes
              // must never turn into wider texture/normal comparisons.
              vec2 detailUV = clamp(uvScreen + vec2(float(x), float(y)) * texel * pixelRatio * 0.75,
                                    texel * 0.5, vec2(1.0) - texel * 0.5);
              float detailRaw = texture2D(tDepth, detailUV).r;
              float normalGap = detailRaw < 0.999999 ? 1.0 - abs(dot(nCenter, surfaceNormal(detailUV))) : 0.0;
              float normalEdge = smoothstep(normalCut * 0.65, normalCut * 1.35, normalGap);
              float tonalEdge = 0.0;
              if (tonalThreshold > 0.0 && detailRaw < 0.999999) {
                float neighborLuma = filteredLuma(detailUV);
                // Unlit color keeps eyes and the beard boundary without tracing cast shadows.
                float darkRidge = max(neighborLuma - centerLuma, 0.0);
                tonalEdge = smoothstep(tonalCut * 0.65, tonalCut * 1.35, darkRidge);
              }
              edge = max(edge, max(max(depthEdge, normalEdge), tonalEdge));
            }
          }
        }
        vec3 surface = mix(base.rgb, backdropColor, outlineOnly);
        float stroke = edge * 0.92;
        if (lineFinish > 1.5) stroke = step(0.8, edge);
        else if (lineFinish > 0.5) stroke = smoothstep(0.45, 0.8, edge);
        // The outline is ink suspended over the page, including empty mesh interiors.
        gl_FragColor = outlineOnly > 0.5
          ? vec4(edgeColor, stroke)
          : vec4(mix(surface, edgeColor, stroke), base.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const post = new THREE.Scene(); post.add(quad);
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const size = new THREE.Vector2();
  const subjectBox = new THREE.Box3(), subjectSize = new THREE.Vector3(), subjectCenter = new THREE.Vector3();

  function setOptions({ thickness = 1, depthThreshold = 0.025, normalThreshold = 0.01,
                        tonalThreshold = 0, lineColor = 'dark', finish = 'soft', only = false,
                        stableDensity = true } = {}) {
    const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    uniforms.thickness.value = Math.max(0.5, Math.min(8, finite(thickness, 1)));
    uniforms.depthThreshold.value = Math.max(0.001, Math.min(0.5, finite(depthThreshold, 0.025)));
    uniforms.normalThreshold.value = Math.max(0.01, Math.min(1, finite(normalThreshold, 0.01)));
    uniforms.tonalThreshold.value = Math.max(0, Math.min(0.5, finite(tonalThreshold, 0)));
    uniforms.stableDensity.value = stableDensity ? 1 : 0;
    uniforms.lineFinish.value = finish === 'ink' ? 2 : finish === 'crisp' ? 1 : 0;
    uniforms.edgeColor.value.set(lineColor === 'light' ? 0xe6eef8 : 0x171717);
    uniforms.backdropColor.value.set(lineColor === 'light' ? 0x14120f : 0xfbfaf7);
    uniforms.outlineOnly.value = only ? 1 : 0;
  }
  function render(scene, camera, exclusions = [], subject = null) {
    renderer.getDrawingBufferSize(size);
    const width = Math.max(1, size.x), height = Math.max(1, size.y);
    if (color.width !== width || color.height !== height) {
      color.setSize(width, height); normal.setSize(width, height); albedo.setSize(width, height);
      uniforms.texel.value.set(1 / width, 1 / height);
    }
    uniforms.nearPlane.value = camera.near;
    uniforms.farPlane.value = camera.far;
    let projectedHeight = 800;
    if (uniforms.stableDensity.value && subject && camera.isPerspectiveCamera) {
      subjectBox.setFromObject(subject);
      if (!subjectBox.isEmpty()) {
        subjectBox.getSize(subjectSize);
        subjectBox.getCenter(subjectCenter);
        const distance = Math.max(camera.position.distanceTo(subjectCenter), camera.near);
        // Detail follows the visible portrait size, not the display's pixel density.
        const focal = (height / renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
        projectedHeight = subjectSize.y * focal / distance;
      }
    }
    uniforms.pixelRatio.value = renderer.getPixelRatio();
    uniforms.projectedHeight.value = projectedHeight;
    const originalBackground = scene.background;
    const originalOverride = scene.overrideMaterial;
    const visibility = exclusions.map(o => [o, o.visible]);
    const materials = [];
    try {
      for (const [o] of visibility) o.visible = false;
      renderer.setRenderTarget(color);
      renderer.render(scene, camera);
      if (uniforms.tonalThreshold.value > 0) {
        scene.traverse(o => {
          if (!o.isMesh || !o.visible) return;
          materials.push([o, o.material]); o.material = unlit(o.material);
        });
        renderer.setRenderTarget(albedo);
        renderer.render(scene, camera);
        for (const [o, material] of materials) o.material = material;
        materials.length = 0;
      }
      scene.background = new THREE.Color(0x000000);
      scene.overrideMaterial = normalMaterial;
      renderer.setRenderTarget(normal);
      renderer.render(scene, camera);
    } finally {
      scene.background = originalBackground;
      scene.overrideMaterial = originalOverride;
      for (const [o, material] of materials) o.material = material;
      for (const [o, visible] of visibility) o.visible = visible;
      renderer.setRenderTarget(null);
    }
    renderer.render(post, postCamera);
  }
  function dispose() {
    color.dispose(); normal.dispose(); albedo.dispose(); normalMaterial.dispose();
    for (const material of unlitMaterials) material.dispose();
    quad.geometry.dispose(); material.dispose();
  }
  return { setOptions, render, dispose };
}
