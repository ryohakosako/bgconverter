"use strict";

const $ = id => document.getElementById(id);
const preview = $("preview");
const previewCtx = preview.getContext("2d");
const frame = $("frame");
const stage = $("stage");
const referenceBox = $("reference-box");
const comparisonOverlay = $("comparison-overlay");
const comparisonDivider = $("comparison-divider");
const warmBackground = demoBackground(false);
const coolBackground = demoBackground(true);
const sampleSubject = demoSubject();
const colorControls = ["temperature", "brightness", "contrast", "highlights", "shadows", "saturation"];
const controls = ["strength", ...colorControls, "scale"];
let background = warmBackground;
let subject = sampleSubject;
let videoUrl = null;
let videoFile = null;
let videoExport = null;
let subjectPixels;
let originalPreviewSubject;
let originalPreviewCtx;
let previewSubject;
let previewPixels;
let previewDirty = true;
let renderPending = false;
let automatic = color.neutral;
let reference = null;
let areaMode = false;
let comparisonMode = "split";
let comparisonPosition = 50;
let position = { x: .46, y: .71 };
let gesture = null;
const loadVersion = { background: 0, subject: 0 };
let sceneVersion = 0;

function status(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}

function dimensionsFor(image, limit) {
  const ratio = Math.min(1, limit / Math.max(image.width, image.height));
  return [Math.max(1, Math.round(image.width * ratio)), Math.max(1, Math.round(image.height * ratio))];
}

function getPixels(ctx, width, height) {
  return ctx.getImageData(0, 0, width, height);
}

function prepareSubject() {
  const [width, height] = dimensionsFor(subject, videoUrl ? 720 : 1024);
  originalPreviewSubject = makeCanvas(width, height);
  originalPreviewCtx = originalPreviewSubject.getContext("2d", { willReadFrequently: true });
  previewSubject = makeCanvas(width, height);
  previewPixels = previewSubject.getContext("2d").createImageData(width, height);
  captureSubjectFrame();
}

function captureSubjectFrame() {
  const { width, height } = originalPreviewSubject;
  originalPreviewCtx.clearRect(0, 0, width, height);
  originalPreviewCtx.drawImage(subject, 0, 0, width, height);
  subjectPixels = null;
  previewDirty = true;
}

function currentSubjectPixels() {
  subjectPixels ??= getPixels(originalPreviewCtx, originalPreviewSubject.width, originalPreviewSubject.height);
  return subjectPixels;
}

function settings() {
  const hex = $("shadow").value;
  const tint = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const tintLight = color.luma(...tint);
  const contrast = +$("contrast").value / 100;
  return {
    temperature: automatic.temperature + +$("temperature").value * .34,
    brightness: automatic.brightness + +$("brightness").value * .55,
    contrast: automatic.contrast,
    manualContrast: contrast * (.045 + 1.155 * Math.abs(contrast) ** 3),
    highlights: +$("highlights").value * .32,
    shadows: +$("shadows").value * .32,
    saturation: automatic.saturation + +$("saturation").value * .008,
    shadow: tint.map((value, channel) => automatic.shadow[channel] + (value - tintLight) * .26)
  };
}

function placement() {
  const fit = Math.min(background.width / subject.width, background.height / subject.height);
  const size = fit * +$("scale").value / 100;
  const width = subject.width * size, height = subject.height * size;
  return {
    x: background.width * position.x - width / 2,
    y: background.height * position.y - height / 2,
    width, height
  };
}

function composite(ctx, image, comparisonImage = null) {
  const { width: canvasWidth, height: canvasHeight } = ctx.canvas;
  const sx = canvasWidth / background.width;
  const sy = canvasHeight / background.height;
  const { x, y, width, height } = placement();
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(background, 0, 0, canvasWidth, canvasHeight);
  const drawSubject = subjectImage => ctx.drawImage(subjectImage, x * sx, y * sy, width * sx, height * sy);
  if (!comparisonImage) {
    drawSubject(image);
    return;
  }
  const cut = Math.round(canvasWidth * comparisonPosition / 100);
  function drawSide(subjectImage, left, sideWidth) {
    if (!sideWidth) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, 0, sideWidth, canvasHeight);
    ctx.clip();
    drawSubject(subjectImage);
    ctx.restore();
  }
  drawSide(image, 0, cut);
  drawSide(comparisonImage, cut, canvasWidth - cut);
}

function render() {
  renderPending = false;
  const strength = +$("strength").value / 100;
  if (comparisonMode !== "before" && strength && previewDirty) {
    const ctx = previewSubject.getContext("2d");
    color.transform(currentSubjectPixels().data, previewPixels.data, settings(), strength);
    ctx.putImageData(previewPixels, 0, 0);
    previewDirty = false;
  }
  const corrected = strength ? previewSubject : originalPreviewSubject;
  if (comparisonMode === "split") {
    composite(previewCtx, originalPreviewSubject, corrected);
  } else {
    composite(previewCtx, comparisonMode === "after" ? corrected : originalPreviewSubject);
  }
}

function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(render);
}

function fitFrame() {
  const padding = parseFloat(getComputedStyle(stage).paddingLeft) * 2;
  frame.style.width = Math.max(1, Math.min(stage.clientWidth - padding, (stage.clientHeight - padding) * preview.width / preview.height)) + "px";
}

function syncReference() {
  $("reference-all").setAttribute("aria-pressed", !areaMode);
  $("reference-area").setAttribute("aria-pressed", areaMode);
  preview.classList.toggle("selecting", areaMode);
  referenceBox.hidden = !areaMode || !reference;
  $("auto").disabled = areaMode && (!reference || gesture?.selecting === true);
  $("hint").textContent = areaMode ? "ドラッグで背景の参照範囲を選択" : "ドラッグで被写体を移動";
  if (referenceBox.hidden) return;
  referenceBox.style.left = reference.x * 100 + "%";
  referenceBox.style.top = reference.y * 100 + "%";
  referenceBox.style.width = reference.width * 100 + "%";
  referenceBox.style.height = reference.height * 100 + "%";
}

function syncControls() {
  for (const name of controls) {
    const value = +$(name).value;
    const isPercent = name === "scale" || name === "strength";
    $(name + "-value").value = isPercent ? value + "%" : (value > 0 ? "+" : "") + value;
  }
  $("position-x").value = (position.x * 100).toFixed(1);
  $("position-y").value = (position.y * 100).toFixed(1);
}

function compare(mode) {
  comparisonMode = mode;
  for (const name of ["before", "split", "after"]) {
    $(name).setAttribute("aria-pressed", name === mode);
  }
  comparisonOverlay.hidden = mode !== "split";
  scheduleRender();
}

function showAdjustment() {
  previewDirty = true;
  compare(comparisonMode === "before" ? "after" : comparisonMode);
}

function setComparisonPosition(value) {
  comparisonPosition = color.clamp(value, 0, 100);
  comparisonOverlay.style.setProperty("--split", comparisonPosition + "%");
  const percent = Math.round(comparisonPosition);
  comparisonDivider.setAttribute("aria-valuenow", percent);
  comparisonDivider.setAttribute("aria-valuetext", `補正前 ${percent}%、補正後 ${100 - percent}%`);
  scheduleRender();
}

function resetColor() {
  automatic = color.neutral;
  for (const name of colorControls) $(name).value = 0;
  $("strength").value = 75;
  $("shadow").value = "#808080";
  $("metrics").hidden = true;
  syncControls();
  showAdjustment();
}

function showBackground(image, name, sample) {
  background = image;
  $("background-name").textContent = name;
  $("sample-warm").setAttribute("aria-pressed", sample === "warm");
  $("sample-cool").setAttribute("aria-pressed", sample === "cool");
  reference = null;
  areaMode = false;
  [$("preview").width, $("preview").height] = dimensionsFor(background, 1440);
  $("dimensions").textContent = background.width + " × " + background.height + " px";
  fitFrame();
  syncReference();
}

function sample(cool) {
  loadVersion.background++;
  loadVersion.subject++;
  sceneVersion++;
  replaceSubject(sampleSubject);
  $("subject-name").textContent = "人物サンプル";
  showBackground(cool ? coolBackground : warmBackground, cool ? "薄暮の山並み" : "夕景の山並み", cool ? "cool" : "warm");
  position = { x: .46, y: .71 };
  $("scale").value = 58;
  resetColor();
  status("サンプルを表示中");
}

function referenceStatistics() {
  const region = areaMode ? reference : { x: 0, y: 0, width: 1, height: 1 };
  const width = region.width * background.width;
  const height = region.height * background.height;
  const ratio = Math.min(1, 360 / Math.max(width, height));
  const canvas = makeCanvas(Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio)));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(background, region.x * background.width, region.y * background.height, width, height, 0, 0, canvas.width, canvas.height);
  return color.statistics(getPixels(ctx, canvas.width, canvas.height).data);
}

function autoCorrect() {
  const bg = referenceStatistics();
  const fg = color.statistics(currentSubjectPixels().data);
  if (!bg.weight || !fg.weight) {
    status("参照範囲と被写体に、透明でない部分が必要です。", true);
    return;
  }
  automatic = color.match(fg, bg);
  showAdjustment();
  const warmth = bg.warmth > 12 ? "暖色寄り" : bg.warmth < -12 ? "寒色寄り" : "中間色";
  $("metrics").textContent = "参照した背景　" + warmth + " / 明るさ " + Math.round(bg.mean / 255 * 100) + "%";
  $("metrics").hidden = false;
  status(videoUrl ? "表示フレームを基準に動画全体へ自動補正を適用しました" : "自動補正を適用しました");
}

function eventPoint(event) {
  const bounds = preview.getBoundingClientRect();
  return {
    x: color.clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
    y: color.clamp((event.clientY - bounds.top) / bounds.height, 0, 1)
  };
}

comparisonDivider.addEventListener("pointerdown", event => {
  if (event.button !== 0 || !event.isPrimary) return;
  comparisonDivider.focus({ preventScroll: true });
  comparisonDivider.setPointerCapture(event.pointerId);
  setComparisonPosition(eventPoint(event).x * 100);
});

for (const name of ["pointermove", "pointerup"]) {
  comparisonDivider.addEventListener(name, event => {
    if (comparisonDivider.hasPointerCapture(event.pointerId)) {
      setComparisonPosition(eventPoint(event).x * 100);
    }
  });
}

comparisonDivider.addEventListener("keydown", event => {
  const step = event.shiftKey ? 10 : 1;
  const positions = {
    ArrowLeft: comparisonPosition - step,
    ArrowDown: comparisonPosition - step,
    ArrowRight: comparisonPosition + step,
    ArrowUp: comparisonPosition + step,
    Home: 0,
    End: 100
  };
  if (!Object.hasOwn(positions, event.key)) return;
  event.preventDefault();
  setComparisonPosition(positions[event.key]);
});

preview.addEventListener("pointerdown", event => {
  if (gesture || event.button !== 0) return;
  const start = eventPoint(event);
  if (!areaMode) {
    const rect = placement();
    const x = start.x * background.width, y = start.y * background.height;
    if (x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) return;
  }
  gesture = { id: event.pointerId, start, position: { ...position }, reference, selecting: areaMode };
  preview.setPointerCapture(event.pointerId);
});

preview.addEventListener("pointermove", event => {
  if (gesture?.id !== event.pointerId) return;
  const current = eventPoint(event);
  const dx = current.x - gesture.start.x, dy = current.y - gesture.start.y;
  if (gesture.selecting) {
    reference = {
      x: Math.min(current.x, gesture.start.x), y: Math.min(current.y, gesture.start.y),
      width: Math.abs(dx), height: Math.abs(dy)
    };
    syncReference();
    return;
  }
  position = { x: gesture.position.x + dx, y: gesture.position.y + dy };
  syncControls();
  scheduleRender();
});

function endGesture(event) {
  if (gesture?.id !== event.pointerId) return;
  const completed = gesture;
  gesture = null;
  if (completed.selecting) {
    const bounds = preview.getBoundingClientRect();
    if (event.type !== "pointerup" || !reference || reference.width * bounds.width < 4 || reference.height * bounds.height < 4) {
      reference = completed.reference;
    } else {
      $("metrics").hidden = true;
      status("選択範囲を参照するには、自動補正を押してください。");
    }
    syncReference();
  }
}

for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) preview.addEventListener(event, endGesture);

function videoClock(seconds) {
  const whole = Math.floor(seconds);
  return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
}

function syncVideoControls(video) {
  $("play-video").textContent = video.paused || video.ended ? "再生" : "一時停止";
  $("video-time").value = video.currentTime;
  $("time-display").value = videoClock(video.currentTime) + " / " + videoClock(video.duration);
}

function replaceSubject(media, url = null, file = null) {
  if (videoUrl) {
    subject.pause();
    subject.removeAttribute("src");
    subject.load();
    URL.revokeObjectURL(videoUrl);
  }
  subject = media;
  videoUrl = url;
  videoFile = file;
  prepareSubject();
  $("video-controls").hidden = !videoUrl;
  $("export-video").hidden = !videoUrl;
  if (!videoUrl) return;

  $("video-time").max = media.duration;
  syncVideoControls(media);
  const updateFrame = () => {
    if (subject !== media || media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    captureSubjectFrame();
    syncVideoControls(media);
    scheduleRender();
  };
  if ("requestVideoFrameCallback" in media) {
    const nextFrame = () => {
      if (subject !== media) return;
      updateFrame();
      media.requestVideoFrameCallback(nextFrame);
    };
    media.requestVideoFrameCallback(nextFrame);
  } else {
    media.addEventListener("timeupdate", updateFrame);
  }
  media.addEventListener("seeked", updateFrame);
  for (const event of ["play", "pause", "ended"]) {
    media.addEventListener(event, () => {
      if (subject === media) syncVideoControls(media);
    });
  }
}

async function readVideo(url, signal) {
  const video = document.createElement("video");
  video.preload = "auto";
  video.playsInline = true;
  video.muted = true;
  await new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    video.addEventListener("loadeddata", resolve, { once: true, signal });
    video.addEventListener("error", () => reject(new Error("MP4を再生できません。このブラウザで再生できる形式のMP4を選んでください。")), { once: true, signal });
    signal?.addEventListener("abort", () => {
      video.removeAttribute("src");
      video.load();
      reject(signal.reason);
    }, { once: true });
    video.src = url;
    video.load();
  });
  if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration) || video.duration <= 0) {
    throw new Error("映像トラックと再生時間を読み取れるMP4を選んでください。");
  }
  video.width = video.videoWidth;
  video.height = video.videoHeight;
  return video;
}

async function loadMedia(input, role) {
  const [file] = input.files;
  if (!file) return;
  input.value = "";
  const version = ++loadVersion[role];
  const url = URL.createObjectURL(file);
  const isVideo = role === "subject" && (file.type === "video/mp4" || /\.mp4$/i.test(file.name));
  try {
    if (role === "subject" && !isVideo) {
      const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const png = [137, 80, 78, 71, 13, 10, 26, 10];
      if (signature.length !== png.length || !png.every((value, index) => value === signature[index])) {
        throw new Error("被写体には透過PNGまたはMP4を選んでください。");
      }
    }
    let media;
    if (isVideo) {
      media = await readVideo(url);
    } else {
      media = new Image();
      media.src = url;
      await media.decode();
    }
    if (version !== loadVersion[role]) return;
    sceneVersion++;
    if (role === "background") {
      showBackground(media, file.name);
    } else {
      replaceSubject(media, isVideo ? url : null, isVideo ? file : null);
      $("subject-name").textContent = file.name;
      position = { x: .5, y: .5 };
    }
    resetColor();
    status(file.name + " を読み込みました");
  } catch (error) {
    if (version === loadVersion[role]) status(error.message || "画像を読み込めませんでした。", true);
  } finally {
    if (videoUrl !== url) URL.revokeObjectURL(url);
  }
}

function correctedOriginal() {
  const result = makeCanvas(subject.width, subject.height);
  const ctx = result.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(subject, 0, 0);
  // Process strips so export does not allocate full-resolution pixel buffers twice.
  const rows = Math.max(1, Math.floor(1_000_000 / result.width));
  const values = settings();
  const strength = +$("strength").value / 100;
  if (!strength) return result;
  for (let y = 0; y < result.height; y += rows) {
    const pixels = ctx.getImageData(0, y, result.width, Math.min(rows, result.height - y));
    color.transform(pixels.data, pixels.data, values, strength);
    ctx.putImageData(pixels, 0, y);
  }
  return result;
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function exportPng(merged) {
  const button = $(merged ? "export-composite" : "export-subject");
  const version = sceneVersion;
  button.disabled = true;
  status("PNGを作成しています…");
  try {
    // Allow a paint before processing the original resolution.
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    if (version !== sceneVersion) return;
    const corrected = correctedOriginal();
    const result = merged ? makeCanvas(background.width, background.height) : corrected;
    if (merged) composite(result.getContext("2d"), corrected);
    const png = await new Promise(resolve => result.toBlob(resolve, "image/png"));
    if (version !== sceneVersion) return;
    if (!png) throw new Error("PNGを作成できませんでした。");
    downloadFile(png, merged ? "bg-converter-composite.png" : "bg-converter-subject.png");
    if (version === sceneVersion) status(videoUrl ? "動画の補正済みフレームをPNGで書き出しました" : "補正後のPNGを書き出しました");
  } catch {
    if (version === sceneVersion) status("PNGを書き出せませんでした。画像のサイズを確認してください。", true);
  } finally {
    button.disabled = false;
  }
}

function setExportProgress(percent) {
  $("export-progress").value = percent;
  $("export-percent").value = percent + "%";
}

async function recordSubject(video, audioContext, values, strength, signal) {
  const canvas = makeCanvas(video.width, video.height);
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  const stream = canvas.captureStream(30);
  let source;
  let recorder;
  let cancelFrame;
  try {
    const audioOutput = audioContext.createMediaStreamDestination();
    source = audioContext.createMediaElementSource(video);
    source.connect(audioOutput);
    for (const track of audioOutput.stream.getAudioTracks()) stream.addTrack(track);
    video.muted = false;
    const options = [
      "video/mp4;codecs=avc1.42001f,mp4a.40.2",
      "video/mp4"
    ];
    const mimeType = options.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("このブラウザはMP4の書き出しに対応していません。");
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    const chunks = [];
    const paintFrame = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (!strength) return;
      const pixels = getPixels(ctx, canvas.width, canvas.height);
      color.transform(pixels.data, pixels.data, values, strength);
      ctx.putImageData(pixels, 0, 0);
    };
    paintFrame();
    const recording = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
      recorder.onerror = () => reject(new Error("MP4のエンコード中にエラーが発生しました。"));
      video.addEventListener("ended", () => {
        if (recorder.state !== "inactive") recorder.stop();
      }, { once: true, signal });
      video.addEventListener("error", () => reject(new Error("書き出し中に映像を読み取れなくなりました。")), { once: true, signal });
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      let lastTime = video.currentTime;
      const schedule = "requestVideoFrameCallback" in video
        ? callback => {
          const id = video.requestVideoFrameCallback((_, metadata) => callback(metadata.mediaTime));
          cancelFrame = () => video.cancelVideoFrameCallback(id);
        }
        : callback => {
          const id = requestAnimationFrame(() => callback(video.currentTime));
          cancelFrame = () => cancelAnimationFrame(id);
        };
      const nextFrame = time => {
        try {
          if (time - lastTime >= 1 / 31) {
            paintFrame();
            lastTime = time;
            setExportProgress(Math.min(99, Math.floor(video.currentTime / video.duration * 100)));
          }
          if (!video.ended && recorder.state === "recording") schedule(nextFrame);
        } catch (error) {
          reject(error);
        }
      };
      recorder.start();
      schedule(nextFrame);
    });
    const [mp4] = await Promise.all([recording, video.play()]);
    signal.throwIfAborted();
    if (!mp4.size || !mp4.type.startsWith("video/mp4")) throw new Error("MP4ファイルを作成できませんでした。");
    return mp4;
  } finally {
    cancelFrame?.();
    video.pause();
    if (recorder && recorder.state !== "inactive") recorder.stop();
    source?.disconnect();
    for (const track of stream.getTracks()) track.stop();
  }
}

async function exportSubjectVideo() {
  if (!videoFile || videoExport) return;
  if (!window.MediaRecorder?.isTypeSupported("video/mp4") || !HTMLCanvasElement.prototype.captureStream || !window.AudioContext) {
    status("このブラウザはMP4の書き出しに対応していません。", true);
    return;
  }
  const controller = new AbortController();
  const { signal } = controller;
  videoExport = controller;
  const url = URL.createObjectURL(videoFile);
  const values = settings();
  const strength = +$("strength").value / 100;
  let audioContext;
  $("export-video").disabled = true;
  $("video-export-progress").hidden = false;
  setExportProgress(0);
  status("被写体MP4を書き出しています。動画の再生時間が目安です。");
  if (!subject.paused) subject.pause();
  try {
    audioContext = new AudioContext();
    const [, video] = await Promise.all([audioContext.resume(), readVideo(url, signal)]);
    signal.throwIfAborted();
    const mp4 = await recordSubject(video, audioContext, values, strength, signal);
    setExportProgress(100);
    downloadFile(mp4, "bg-converter-subject.mp4");
    status("補正済みの被写体MP4を保存しました");
  } catch (error) {
    status(signal.aborted ? "MP4の書き出しを中止しました" : (error.message || "MP4を書き出せませんでした。"), !signal.aborted);
  } finally {
    if (audioContext && audioContext.state !== "closed") await audioContext.close().catch(() => {});
    URL.revokeObjectURL(url);
    videoExport = null;
    $("export-video").disabled = false;
    $("video-export-progress").hidden = true;
  }
}

for (const name of [...controls, "shadow"]) {
  $(name).addEventListener("input", () => {
    syncControls();
    if (name === "scale") {
      scheduleRender();
    } else {
      showAdjustment();
    }
  });
}
for (const axis of ["x", "y"]) {
  const input = $("position-" + axis);
  input.addEventListener("change", () => {
    if (Number.isFinite(input.valueAsNumber)) position[axis] = color.clamp(input.valueAsNumber, -200, 300) / 100;
    syncControls();
    scheduleRender();
  });
}
$("reset-position").onclick = () => {
  position = { x: .5, y: .5 };
  syncControls();
  scheduleRender();
};
for (const mode of ["before", "split", "after"]) $(mode).onclick = () => compare(mode);
$("reference-all").onclick = () => { areaMode = false; $("metrics").hidden = true; syncReference(); };
$("reference-area").onclick = () => { areaMode = true; $("metrics").hidden = true; syncReference(); };
$("auto").onclick = autoCorrect;
$("reset-color").onclick = () => { resetColor(); status("補正をリセットしました"); };
$("background-file").onchange = event => loadMedia(event.target, "background");
$("subject-file").onchange = event => loadMedia(event.target, "subject");
$("play-video").onclick = async () => {
  if (!videoUrl) return;
  const video = subject;
  if (!video.paused && !video.ended) {
    video.pause();
    return;
  }
  if (video.ended) video.currentTime = 0;
  try {
    await video.play();
  } catch {
    if (subject === video) status("動画を再生できませんでした。", true);
  }
};
$("video-time").oninput = event => {
  if (videoUrl) subject.currentTime = event.target.valueAsNumber;
};
$("sample-warm").onclick = () => sample(false);
$("sample-cool").onclick = () => sample(true);
$("export-subject").onclick = () => exportPng(false);
$("export-composite").onclick = () => exportPng(true);
$("export-video").onclick = exportSubjectVideo;
$("cancel-export").onclick = () => videoExport?.abort();
new ResizeObserver(fitFrame).observe(stage);
sample(false);
