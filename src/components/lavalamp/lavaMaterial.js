import * as THREE from 'three';
import { TRANSFER_FIELD_GLSL } from './transferSurface';
import { TRANSFER_MOTION_GLSL } from './transferMotion';

export const createLavaLampMaterial = (baseColor, highlightColor) => {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBaseColor: { value: new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b) },
      uHighlightColor: { value: new THREE.Vector3(highlightColor.r, highlightColor.g, highlightColor.b) },
      uTextInfluence: { value: 0.0 },
      uTime: { value: 0.0 },
      uInkTransfer: { value: 0.0 },
      uOpacity: { value: 1.0 },
      uDetached: { value: 0.0 },
      uDissolve: { value: 0.0 },
      uTransferProgress: { value: -1 },
      uTransferClock: { value: 0 },
      uTransferMotion: { value: 0 },
      uTransferLow: { value: new THREE.Vector3(-1, -1, -1) },
      uTransferHigh: { value: new THREE.Vector3(1, 1, 1) },
      uLiquidHead: { value: new THREE.Vector3() },
      uLiquidActive: { value: 0.0 }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;
      varying vec3 vLocalPosition;
      uniform float uTime;
      uniform float uDetached;
      uniform float uTransferClock, uTransferMotion;
      ${TRANSFER_MOTION_GLSL}

      void main() {
        float detachedWarp = (
          sin(position.y * 3.4 + uTime * 2.1) +
          sin(position.x * 4.1 - uTime * 1.7)
        ) * 0.035 * uDetached;
        vec3 deformedPosition = transferMotion(position, uTransferClock, uTransferMotion) + normalize(normal) * detachedWarp;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(deformedPosition, 1.0);
        vViewPosition = -mvPosition.xyz;
        vWorldPosition = (modelMatrix * vec4(deformedPosition, 1.0)).xyz;
        vLocalPosition = position;

        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;
      varying vec3 vLocalPosition;
      uniform vec3 uBaseColor;
      uniform vec3 uHighlightColor;
      uniform float uTextInfluence;
      uniform float uTime;
      uniform float uInkTransfer;
      uniform float uOpacity;
      uniform float uDissolve;
      uniform float uTransferProgress;
      uniform vec3 uTransferLow, uTransferHigh;
      uniform vec3 uLiquidHead;
      uniform float uLiquidActive;

      ${TRANSFER_FIELD_GLSL}

      void main() {
        // Calculate fresnel effect for edge highlighting
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 3.0);

        // Text influence effect
        float distanceFromCenter = length(vWorldPosition - vec3(0.0, 0.0, 0.0));
        float textGlow = uTextInfluence * (1.0 - smoothstep(0.0, 2.0, distanceFromCenter));

        // Add subtle pulsing effect when text is present
        float pulse = 1.0 + uTextInfluence * 0.1 * sin(uTime * 3.0);

        // Enhanced highlight color with text influence
        vec3 enhancedHighlight = mix(uHighlightColor, vec3(1.0, 1.0, 1.0), textGlow * 0.3);

        // Create gradient based on viewing angle with text enhancement
        float enhancedFresnel = fresnel + textGlow * 0.4 * pulse;
        vec3 finalColor = mix(uBaseColor, enhancedHighlight, enhancedFresnel);
        // A fixed light reveals the neck's curvature and the lobe's depth.
        float liquidLight = uLiquidActive * (1.0 - smoothstep(.5, 2.0, distance(vWorldPosition, uLiquidHead)));
        vec3 keyLight = normalize(vec3(-.45, .8, 1.0));
        float diffuse = max(dot(normalize(vNormal), keyLight), 0.0);
        float specular = pow(max(dot(normalize(vNormal), normalize(viewDir + keyLight)), 0.0), 24.0);
        finalColor += liquidLight * vec3(.055 * diffuse + .19 * specular);

        float release = transferRelease(vLocalPosition, uTransferLow, uTransferHigh);
        float remaining = 1. - smoothstep(release - .014, release + .014, uTransferProgress);
        if (remaining < .001) discard;

        // Add subtle brightness boost when text is casting influence
        finalColor += vec3(textGlow * 0.2 * pulse);

        // Calculate final opacity
        float opacity = 0.95 - fresnel * 0.15 + textGlow * 0.1;

        gl_FragColor = vec4(finalColor, opacity * uOpacity * remaining);
      }
    `,
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: true,
    side: THREE.DoubleSide
  });
};
