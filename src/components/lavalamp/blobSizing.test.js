import test from 'node:test';
import assert from 'node:assert/strict';
import { menuBlobScale, menuLayout } from './blobSizing.js';

test('blob and menu are centered as one group with a bounded gap', () => {
  for (const [width, height] of [[850, 1350], [1440, 900], [3840, 2160], [900, 400]]) {
    const layout = menuLayout(width, height);
    const left = layout.blobX - layout.diameter / 2;
    const right = width - layout.menuLeft - layout.menuWidth;
    assert.ok(Math.abs(left - right) < 1e-8);
    assert.ok(left >= 19.99);
    assert.equal(layout.centerY, height / 2);
    assert.ok(layout.gap >= 36 && layout.gap <= 112.5);
    assert.ok(Math.abs(layout.menuLeft - layout.blobX - layout.diameter / 2 - layout.gap) < 1e-8);
  }
});

test('resizing is continuous within each layout, including old desktop breakpoints', () => {
  for (const height of [600, 900, 1350]) {
    let previous = menuLayout(320, height);
    for (let width = 321; width <= 3840; width++) {
      const next = menuLayout(width, height);
      if (next.stacked !== previous.stacked) { previous = next; continue; }
      for (const key of ['blobX', 'menuLeft', 'diameter', 'gap', 'menuWidth']) {
        assert.ok(Math.abs(next[key] - previous[key]) <= 1.01, `${key} jumped at ${width}`);
      }
      previous = next;
    }
  }
});

test('portrait phones reserve a full touch menu below a prominent centered blob', () => {
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932], [600, 960]]) {
    const layout = menuLayout(width, height);
    assert.equal(layout.stacked, true);
    assert.equal(layout.blobX, width / 2);
    assert.equal(layout.menuLeft + layout.menuWidth / 2, width / 2);
    assert.ok(layout.diameter >= Math.min(width * .6, 320));
    assert.ok(layout.blobY - layout.diameter / 2 >= 32);
    assert.ok(layout.menuTop + layout.menuHeight <= height - 32);
    assert.ok(Math.abs(layout.menuTop - layout.blobY - layout.diameter / 2 - layout.gap) < 1e-8);
    assert.equal(layout.menuHeight, 2 * 48 + 8);
  }
  assert.equal(menuLayout(667, 375).stacked, false);
});

test('large monitors cap the projected blob instead of scaling it with the screen', () => {
  for (const [width, height, distance] of [[1920, 1080, 25], [2560, 1440, 21.6], [3840, 2160, 18], [3440, 1440, 22]]) {
    const scale = menuBlobScale(width, height, 40, distance);
    const viewHeight = 2 * Math.tan(40 * Math.PI / 360) * distance;
    const projected = scale / viewHeight * height;
    assert.ok(projected <= 576.0001);
    assert.ok(projected > 300);
  }
});

test('visible-size target retains window and navigation clearance', () => {
  assert.equal(menuLayout(3840, 2160).diameter, 480 * 1.2);
  for (const [width, height] of [[375, 812], [850, 1350], [1920, 1080]]) {
    const layout = menuLayout(width, height);
    assert.ok(layout.diameter <= height - 40);
    assert.ok(layout.menuLeft + layout.menuWidth <= width - (layout.stacked ? 16 : 20));
  }
});

test('camera distance changes preserve the shared screen-space allowance', () => {
  for (const fov of [35, 40, 45, 50]) {
    for (const distance of [18, 25, 35]) {
      const viewHeight = 2 * Math.tan(fov * Math.PI / 360) * distance;
      const projected = menuBlobScale(850, 1350, fov, distance) / viewHeight;
      const referenceHeight = 2 * Math.tan(fov * Math.PI / 360) * 25;
      assert.ok(Math.abs(projected - menuBlobScale(850, 1350, fov, 25) / referenceHeight) < 1e-8);
    }
  }
});
