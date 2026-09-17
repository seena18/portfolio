// Calibrate to real geometry once; never resize in response to animated lobes.
export function menuBlobScale(width, height, fov, cameraDistance, referenceDiameter = 1) {
  const layout = menuLayout(width, height);
  const focalPixels = height / (2 * Math.tan(fov * Math.PI / 360));
  return layout.diameter * Math.abs(cameraDistance) / focalPixels / referenceDiameter;
}

export function menuLayout(width, height) {
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  if (width <= 600 && height >= width) {
    // Two horizontal rows of 48px targets with an 8px row gap.
    const menuHeight = 104;
    const gap = clamp(height * .05, 28, 44);
    const diameter = Math.max(24, Math.min(320, width * .72, height * .42, height - menuHeight - gap - 64));
    const top = (height - diameter - gap - menuHeight) / 2;
    const menuWidth = Math.min(480, width - 32);
    const menuTop = top + diameter + gap;
    return {
      stacked: true, diameter, gap, menuWidth, menuHeight, menuTop,
      blobX: width / 2, blobY: top + diameter / 2,
      menuLeft: (width - menuWidth) / 2, centerY: menuTop + menuHeight / 2,
    };
  }
  const padding = clamp(width * .045, 20, 64);
  const menuWidth = clamp(width * .14, 112, 176);
  const gap = clamp(width * .0675, 36, 112.5);
  const diameter = Math.max(24, Math.min(576, height * .624, (width - padding * 2 - menuWidth - gap) * .984));
  const left = (width - diameter - gap - menuWidth) / 2;
  return { stacked: false, diameter, gap, menuWidth, blobX: left + diameter / 2, blobY: height / 2, menuLeft: left + diameter + gap, centerY: height / 2 };
}
