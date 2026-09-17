// The mesh and particle origins use this same smooth volume deformation.
// Subtracting the initial phase makes entry continuous with the live mesh.
export const TRANSFER_MOTION_GLSL = `
  vec3 transferMotion(vec3 p, float clock, float strength) {
    vec3 wave = vec3(
      sin(p.y * 4. + clock * 1.8) - sin(p.y * 4.),
      sin(p.z * 3.5 + clock * 1.5) - sin(p.z * 3.5),
      sin(p.x * 4.5 - clock * 1.6) - sin(p.x * 4.5)
    );
    float stretch = sin(clock * 1.7) * .055 * strength;
    return p * vec3(1. - stretch * .5, 1. + stretch, 1. - stretch * .5)
      + wave * .022 * strength;
  }
`;

export function deformTransferPoint(point, clock, strength, output) {
  const { x, y, z } = point;
  const stretch = Math.sin(clock * 1.7) * .055 * strength;
  return output.set(
    x * (1 - stretch * .5) + (Math.sin(y * 4 + clock * 1.8) - Math.sin(y * 4)) * .022 * strength,
    y * (1 + stretch) + (Math.sin(z * 3.5 + clock * 1.5) - Math.sin(z * 3.5)) * .022 * strength,
    z * (1 - stretch * .5) + (Math.sin(x * 4.5 - clock * 1.6) - Math.sin(x * 4.5)) * .022 * strength,
  );
}
