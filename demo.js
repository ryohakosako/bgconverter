"use strict";

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function demoBackground(cool) {
  const canvas = makeCanvas(1440, 900);
  const ctx = canvas.getContext("2d");
  function gradient(top, bottom, start = 0, end = 900) {
    const fill = ctx.createLinearGradient(0, start, 0, end);
    fill.addColorStop(0, top);
    fill.addColorStop(1, bottom);
    return fill;
  }
  ctx.fillStyle = gradient(cool ? "#253a66" : "#63435d", cool ? "#9ccad8" : "#ffc18d", 0, 590);
  ctx.fillRect(0, 0, 1440, 900);
  const sunX = 1068, sunY = 296;
  const glow = ctx.createRadialGradient(sunX, sunY, 20, sunX, sunY, 310);
  glow.addColorStop(0, cool ? "#d2eaf4a0" : "#ffdda1ce");
  glow.addColorStop(1, cool ? "#d2eaf400" : "#ffdda100");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1440, 650);
  ctx.fillStyle = cool ? "#e0f3f5" : "#ffdfac";
  ctx.beginPath();
  ctx.arc(sunX, sunY, cool ? 30 : 56, 0, 2 * Math.PI);
  ctx.fill();

  let seed = 961;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let i = 0; i < 32; i++) {
    const x = random() * 1500, y = 90 + random() * 380, size = 25 + random() * 145;
    const cloud = ctx.createRadialGradient(x, 0, 0, x, 0, size);
    cloud.addColorStop(0, cool ? "#b0c9e133" : "#ffbd933d");
    cloud.addColorStop(1, "#ffffff00");
    ctx.save();
    ctx.translate(0, y);
    ctx.scale(1, .065);
    ctx.fillStyle = cloud;
    ctx.fillRect(x - size, -size, size * 2, size * 2);
    ctx.restore();
  }

  const ridges = [
    [451, 352, 407, 313, 370, 349, 439, 410, 458, 392, 419, 368, 439],
    [487, 446, 463, 411, 478, 504, 470, 511, 428, 369, 420, 385, 410],
    [460, 413, 477, 503, 543, 518, 559, 536, 512, 491, 464, 504, 443],
    [636, 601, 616, 667, 633, 690, 711, 670, 681, 622, 588, 569, 548],
    [739, 697, 766, 734, 777, 803, 825, 806, 790, 750, 714, 728, 679]
  ];
  const palette = cool
    ? [["#829ab5", "#9fc4d4"], ["#6784a2", "#8cb1c4"], ["#506d8a", "#739cad"], ["#34536c", "#476d79"], ["#233c4a", "#182c39"]]
    : [["#a07483", "#d69d94"], ["#875f75", "#b47c83"], ["#694b65", "#9e6c77"], ["#503a53", "#744953"], ["#473740", "#272631"]];
  ridges.forEach((heights, layer) => {
    const vertices = [];
    heights.forEach((height, index) => {
      if (index) {
        for (let step = 1; step < 15; step++) {
          const t = step / 15;
          const y = heights[index - 1] * (1 - t) + height * t;
          vertices.push([(index - 1 + t) * 120, y + (random() - .5) * (layer + 3) * 2]);
        }
      }
      vertices.push([index * 120, height]);
    });
    ctx.beginPath();
    ctx.moveTo(...vertices[0]);
    vertices.slice(1).forEach(point => ctx.lineTo(...point));
    ctx.lineTo(1440, 900);
    ctx.lineTo(0, 900);
    ctx.closePath();
    ctx.fillStyle = gradient(...palette[layer], Math.min(...heights), Math.max(...heights) + 120);
    ctx.fill();
  });
  return canvas;
}

function demoSubject() {
  const canvas = makeCanvas(425, 620);
  const ctx = canvas.getContext("2d");
  function shape(fill, draw) {
    ctx.beginPath();
    draw(ctx);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  const fabric = ctx.createLinearGradient(86, 140, 351, 570);
  fabric.addColorStop(0, "#d0ded9");
  fabric.addColorStop(.55, "#839e9a");
  fabric.addColorStop(1, "#536e70");
  shape(fabric, p => {
    p.moveTo(200, 185);
    p.bezierCurveTo(133, 197, 114, 218, 86, 279);
    p.bezierCurveTo(58, 336, 56, 428, 31, 565);
    p.quadraticCurveTo(52, 587, 98, 579);
    p.lineTo(142, 456);
    p.lineTo(134, 581);
    p.quadraticCurveTo(222, 608, 328, 579);
    p.lineTo(324, 420);
    p.lineTo(367, 553);
    p.quadraticCurveTo(395, 558, 414, 539);
    p.bezierCurveTo(396, 433, 383, 242, 306, 211);
  });
  shape("#9f6c57", p => {
    p.moveTo(206, 132); p.lineTo(191, 191); p.quadraticCurveTo(224, 237, 274, 201);
    p.lineTo(272, 131);
  });
  const skin = ctx.createLinearGradient(207, 52, 306, 166);
  skin.addColorStop(0, "#dfae90");
  skin.addColorStop(1, "#ad745f");
  shape(skin, p => {
    p.moveTo(185, 80); p.bezierCurveTo(184, 4, 273, 8, 294, 62);
    p.quadraticCurveTo(302, 82, 318, 112); p.lineTo(301, 120);
    p.quadraticCurveTo(302, 158, 276, 169);
    p.quadraticCurveTo(205, 167, 185, 80);
  });
  shape("#302b2d", p => {
    p.moveTo(288, 61); p.quadraticCurveTo(260, 66, 241, 83); p.lineTo(227, 117);
    p.quadraticCurveTo(221, 114, 219, 133); p.lineTo(199, 151);
    p.bezierCurveTo(173, 129, 162, 73, 183, 44);
    p.bezierCurveTo(199, 10, 269, 0, 291, 40); p.quadraticCurveTo(299, 50, 288, 61);
  });
  shape("#c28c73", p => { p.ellipse(228, 113, 11, 16, -.42, 0, 2 * Math.PI); });
  shape("#4e3732", p => { p.ellipse(286, 92, 5, 2, -.13, 0, 2 * Math.PI); });
  shape("#344c51", p => {
    p.moveTo(181, 204);
    p.bezierCurveTo(127, 242, 111, 321, 112, 455);
    p.lineTo(132, 446);
    p.bezierCurveTo(141, 307, 159, 253, 209, 221);
  });
  shape("#496468", p => {
    p.moveTo(278, 193); p.quadraticCurveTo(258, 218, 224, 230);
    p.quadraticCurveTo(197, 219, 181, 199); p.lineTo(191, 180);
    p.quadraticCurveTo(220, 208, 271, 178);
  });
  ctx.strokeStyle = "#e2ede977";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(235, 234); ctx.quadraticCurveTo(250, 393, 246, 580);
  ctx.moveTo(164, 472); ctx.lineTo(209, 433);
  ctx.moveTo(305, 467); ctx.lineTo(279, 435);
  ctx.stroke();
  return canvas;
}
