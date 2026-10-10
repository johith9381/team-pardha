/**
 * PARDHA ROADSENSE — INTERACTIVE APPLICATION LOGIC
 * Features:
 * 1. Real-time Road Vision Simulator (Canvas 60FPS with YOLO / SAM 2 overlays)
 * 2. Dynamic Risk & Metrology Calculation Engine
 * 3. Municipal GIS Corridor Map & Incident Feed
 * 4. Interactive 8-Slide Pitch Deck Modal with Keyboard Nav
 */

document.addEventListener("DOMContentLoaded", () => {
  initRoadSimulator();
  initRiskCalculator();
  initGisMap();
  initPitchDeck();
});

/* ==========================================================================
   1. REAL-TIME ROAD VISION SIMULATOR (HTML5 CANVAS)
   ========================================================================== */
function initRoadSimulator() {
  const canvas = document.getElementById("road-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Telemetry HUD Elements
  const hudDefectName = document.getElementById("hud-defect-name");
  const hudConf = document.getElementById("hud-conf");
  const hudArea = document.getElementById("hud-area");
  const hudDiameter = document.getElementById("hud-diameter");
  const hudRisk = document.getElementById("hud-risk");
  const hudGps = document.getElementById("hud-gps");
  const hudFps = document.getElementById("hud-fps");
  const modeExplanation = document.getElementById("sim-mode-explanation");
  const hazardSelect = document.getElementById("hazard-type-select");
  const togglePlayBtn = document.getElementById("sim-toggle-play");
  const resetBtn = document.getElementById("sim-reset-view");

  let isPlaying = true;
  let currentMode = "combined"; // 'combined', 'yolo', 'sam2', 'raw'
  let currentHazardKey = "pothole_major";
  let lastTime = performance.now();
  let frameCount = 0;
  let fpsTimer = 0;

  // Road Perspective & Hazard Animation State
  let roadOffset = 0;
  let hazardZ = 0.65; // 0 (horizon) to 1.0 (hood)

  // Hazard Data Profiles
  const hazardData = {
    pothole_major: {
      name: "Deep Asphalt Crater (Pothole)",
      conf: "96.8%",
      area: "0.42 m² (Exact)",
      diameter: "73.2 cm",
      risk: "8.6 / 10 · HIGH",
      riskClass: "risk-high",
      gps: "17.4382° N, 78.3844° E",
      points: [
        [-50, -20], [-25, -35], [20, -30], [55, -15],
        [65, 10], [40, 32], [-10, 38], [-45, 25], [-60, 5]
      ]
    },
    alligator_crack: {
      name: "Structural Fatigue Cracking",
      conf: "91.4%",
      area: "1.18 m² (Exact)",
      diameter: "122.5 cm",
      risk: "7.2 / 10 · MEDIUM",
      riskClass: "risk-med",
      gps: "17.4415° N, 78.3892° E",
      points: [
        [-70, -25], [-10, -40], [60, -20], [80, 15],
        [45, 45], [-20, 35], [-75, 20]
      ]
    },
    eroded_edge: {
      name: "Broken Road Shoulder / Edge",
      conf: "94.2%",
      area: "0.78 m² (Exact)",
      diameter: "99.6 cm",
      risk: "8.1 / 10 · HIGH",
      riskClass: "risk-high",
      gps: "17.4468° N, 78.3931° E",
      points: [
        [-90, -15], [-40, -25], [10, -10], [30, 20],
        [-10, 40], [-80, 35]
      ]
    }
  };

  // Mode explanation text map
  const explanationMap = {
    combined: "<strong>Combined Mode Active:</strong> YOLO spots the candidate region in 16ms, then prompts SAM 2 to outline the exact jagged perimeter. This eliminates false asphalt pixels and measures true physical damage.",
    yolo: "<strong>Stage 1 (YOLO Only):</strong> Rapid object detection identifies candidate bounding boxes with 0.95 precision. Notice the square box includes ~45% un-damaged healthy asphalt.",
    sam2: "<strong>Stage 2 (SAM 2 Only):</strong> Meta's SAM 2 receives prompt boxes and hugs the exact fracture contour. Mask accuracy jumps from 0.73 to 0.86 IoU.",
    raw: "<strong>Raw Dashcam Feed:</strong> Standard 1080p vehicle camera stream without computer vision overlays."
  };

  // Toggle Mode Buttons
  const modeButtons = document.querySelectorAll(".sim-toggle-btn");
  modeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      modeButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentMode = btn.getAttribute("data-mode");
      if (modeExplanation) {
        modeExplanation.innerHTML = explanationMap[currentMode] || "";
      }
    });
  });

  // Hazard Type Select
  if (hazardSelect) {
    hazardSelect.addEventListener("change", (e) => {
      currentHazardKey = e.target.value;
      updateHud(hazardData[currentHazardKey]);
    });
  }

  // Play / Pause Toggle
  if (togglePlayBtn) {
    togglePlayBtn.addEventListener("click", () => {
      isPlaying = !isPlaying;
      togglePlayBtn.innerHTML = isPlaying
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    });
  }

  // Reset Button
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      hazardZ = 0.2;
    });
  }

  function updateHud(data) {
    if (!data) return;
    if (hudDefectName) hudDefectName.textContent = data.name;
    if (hudConf) hudConf.textContent = data.conf;
    if (hudArea) hudArea.textContent = data.area;
    if (hudDiameter) hudDiameter.textContent = data.diameter;
    if (hudGps) hudGps.textContent = data.gps;
    if (hudRisk) {
      hudRisk.textContent = data.risk;
      hudRisk.className = `hud-badge ${data.riskClass}`;
    }
  }

  // Initial HUD update
  updateHud(hazardData[currentHazardKey]);

  // Main Render Loop
  function render(time) {
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    // FPS Meter
    frameCount++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      const fps = Math.round(frameCount / fpsTimer);
      if (hudFps) hudFps.textContent = `${fps} FPS`;
      frameCount = 0;
      fpsTimer = 0;
    }

    if (isPlaying) {
      roadOffset += dt * 4;
      hazardZ += dt * 0.12;
      if (hazardZ > 1.15) {
        hazardZ = 0.25; // Loop defect back to distance
      }
    }

    drawScene(ctx, canvas.width, canvas.height, roadOffset, hazardZ, currentMode, currentHazardKey);
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);

  function drawScene(ctx, w, h, offset, z, mode, hazardKey) {
    // 1. Sky & Horizon
    const horizonY = h * 0.38;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, "#0F172A");
    skyGrad.addColorStop(0.7, "#1E293B");
    skyGrad.addColorStop(1, "#334155");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, horizonY);

    // Distant tree line silhouette
    ctx.fillStyle = "#1E293B";
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (let x = 0; x < w; x += 40) {
      const treeH = Math.sin(x * 0.05) * 8 + 10;
      ctx.lineTo(x, horizonY - treeH);
    }
    ctx.lineTo(w, horizonY);
    ctx.fill();

    // 2. Asphalt Road Surface
    const roadGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    roadGrad.addColorStop(0, "#2B3547");
    roadGrad.addColorStop(0.5, "#1E2638");
    roadGrad.addColorStop(1, "#121826");
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // 3. Perspective Road Borders & Lane Lines
    const vanishX = w * 0.5;
    const roadLeftX = w * 0.08;
    const roadRightX = w * 0.92;

    // Grass Shoulders
    ctx.fillStyle = "#0F1E1A";
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(vanishX - 80, horizonY);
    ctx.lineTo(roadLeftX, h);
    ctx.lineTo(0, h);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(w, horizonY);
    ctx.lineTo(vanishX + 80, horizonY);
    ctx.lineTo(roadRightX, h);
    ctx.lineTo(w, h);
    ctx.fill();

    // Solid Edge Lines (Reflective White)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(vanishX - 70, horizonY);
    ctx.lineTo(roadLeftX + 30, h);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(vanishX + 70, horizonY);
    ctx.lineTo(roadRightX - 30, h);
    ctx.stroke();

    // Center Dashed Dividing Lines
    const numDashes = 10;
    for (let i = 0; i < numDashes; i++) {
      let dashProgress = (i / numDashes + (offset % 1)) % 1;
      let y1 = horizonY + Math.pow(dashProgress, 2.2) * (h - horizonY);
      let y2 = horizonY + Math.pow(Math.min(dashProgress + 0.05, 1), 2.2) * (h - horizonY);
      let lineW = 2 + dashProgress * 8;

      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.beginPath();
      ctx.rect(vanishX - lineW / 2, y1, lineW, Math.max(2, y2 - y1));
      ctx.fill();
    }

    // 4. Render Approaching Road Hazard
    const curHazard = hazardData[hazardKey] || hazardData.pothole_major;
    const scale = Math.pow(z, 2.5); // perspective scale
    const hazardX = vanishX + 60 * z;
    const hazardY = horizonY + Math.pow(z, 1.8) * (h - horizonY);

    if (z > 0.1 && z < 1.1) {
      ctx.save();
      ctx.translate(hazardX, hazardY);
      ctx.scale(scale * 1.5, scale * 0.9); // perspective flattening

      // Base Asphalt Defect Texture (Dark Pit / Cracks)
      ctx.beginPath();
      const pts = curHazard.points;
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.closePath();

      // Pothole Depth Texture
      ctx.fillStyle = "#0A0D14";
      ctx.fill();
      ctx.strokeStyle = "#1A2234";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Subtle internal depth shade
      const shadowGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, 45);
      shadowGrad.addColorStop(0, "rgba(0, 0, 0, 0.9)");
      shadowGrad.addColorStop(1, "rgba(15, 23, 42, 0.2)");
      ctx.fillStyle = shadowGrad;
      ctx.fill();

      // If Mode includes Stage 2 (SAM 2) Micro-Contour
      if (mode === "sam2" || mode === "combined") {
        ctx.strokeStyle = "#06B6D4"; // High-tech Cyan
        ctx.lineWidth = 3 / (scale * 1.5 || 1);
        ctx.shadowColor = "#06B6D4";
        ctx.shadowBlur = 14;
        ctx.stroke();

        ctx.fillStyle = "rgba(6, 182, 212, 0.28)";
        ctx.fill();
      }

      ctx.restore();

      // If Mode includes Stage 1 (YOLO) Bounding Box
      if (mode === "yolo" || mode === "combined") {
        const boxW = 190 * scale;
        const boxH = 110 * scale;
        const bX = hazardX - boxW / 2;
        const bY = hazardY - boxH / 2;

        ctx.save();
        ctx.strokeStyle = mode === "combined" ? "rgba(37, 99, 235, 0.9)" : "#3B82F6";
        ctx.lineWidth = 2;
        ctx.strokeRect(bX, bY, boxW, boxH);

        // Corner Accent Brackets
        const bracketLen = Math.min(16, boxW * 0.2);
        ctx.strokeStyle = "#22D3EE";
        ctx.lineWidth = 3;

        // Top Left
        ctx.beginPath();
        ctx.moveTo(bX, bY + bracketLen);
        ctx.lineTo(bX, bY);
        ctx.lineTo(bX + bracketLen, bY);
        ctx.stroke();

        // Top Right
        ctx.beginPath();
        ctx.moveTo(bX + boxW - bracketLen, bY);
        ctx.lineTo(bX + boxW, bY);
        ctx.lineTo(bX + boxW, bY + bracketLen);
        ctx.stroke();

        // Bottom Left
        ctx.beginPath();
        ctx.moveTo(bX, bY + boxH - bracketLen);
        ctx.lineTo(bX, bY + boxH);
        ctx.lineTo(bX + bracketLen, bY + boxH);
        ctx.stroke();

        // Bottom Right
        ctx.beginPath();
        ctx.moveTo(bX + boxW - bracketLen, bY + boxH);
        ctx.lineTo(bX + boxW, bY + boxH);
        ctx.lineTo(bX + boxW, bY + boxH - bracketLen);
        ctx.stroke();

        // Box Tag
        ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
        ctx.fillRect(bX, bY - 24, 150, 20);
        ctx.fillStyle = "#38BDF8";
        ctx.font = "bold 11px 'Plus Jakarta Sans', sans-serif";
        ctx.fillText(`YOLO: ${curHazard.conf} [DEFECT]`, bX + 6, bY - 10);

        ctx.restore();
      }
    }

    // Vignette / Vehicle Windshield Bottom Tint
    const hoodGrad = ctx.createLinearGradient(0, h - 40, 0, h);
    hoodGrad.addColorStop(0, "transparent");
    hoodGrad.addColorStop(1, "rgba(2, 6, 23, 0.85)");
    ctx.fillStyle = hoodGrad;
    ctx.fillRect(0, h - 40, w, 40);
  }
}

/* ==========================================================================
   2. DYNAMIC RISK & METROLOGY CALCULATOR
   ========================================================================== */
function initRiskCalculator() {
  const inputArea = document.getElementById("input-area");
  const inputSpeed = document.getElementById("input-speed");
  const toggleSchool = document.getElementById("toggle-school");
  const toggleCurve = document.getElementById("toggle-curve");
  const toggleRain = document.getElementById("toggle-rain");

  const valArea = document.getElementById("val-area");
  const valSpeed = document.getElementById("val-speed");
  const riskScoreVal = document.getElementById("risk-score-val");
  const riskBadge = document.getElementById("risk-status-badge");
  const riskActionText = document.getElementById("risk-action-text");
  const riskMixEst = document.getElementById("risk-mix-est");
  const riskTwoWheeler = document.getElementById("risk-two-wheeler");

  function calculateRisk() {
    if (!inputArea || !inputSpeed) return;
    const area = parseFloat(inputArea.value);
    const speed = parseInt(inputSpeed.value, 10);
    const nearSchool = toggleSchool ? toggleSchool.checked : false;
    const blindCurve = toggleCurve ? toggleCurve.checked : false;
    const rainProne = toggleRain ? toggleRain.checked : false;

    if (valArea) valArea.textContent = `${area.toFixed(2)} m²`;
    if (valSpeed) valSpeed.textContent = `${speed} km/h`;

    // Formula: Area (40%) + Speed (30%) + Environmental Context (30%)
    let baseScore = (area / 2.0) * 4.5;
    let speedScore = (speed / 120) * 3.0;
    let envScore = (nearSchool ? 1.2 : 0) + (blindCurve ? 1.0 : 0) + (rainProne ? 0.8 : 0);

    let totalScore = Math.min(10.0, Math.max(1.0, baseScore + speedScore + envScore));
    totalScore = Math.round(totalScore * 10) / 10;

    if (riskScoreVal) riskScoreVal.textContent = totalScore.toFixed(1);

    // Dynamic UI states
    if (totalScore >= 7.5) {
      if (riskBadge) {
        riskBadge.textContent = "EMERGENCY / HIGH PRIORITY";
        riskBadge.className = "score-badge-status high";
      }
      if (riskActionText) riskActionText.textContent = "Dispatch Road Patch Crew within 24 Hours";
      if (riskTwoWheeler) {
        riskTwoWheeler.textContent = "Critical (High Swerve / Tip-Over Risk)";
        riskTwoWheeler.className = "color-red";
      }
    } else if (totalScore >= 4.5) {
      if (riskBadge) {
        riskBadge.textContent = "SCHEDULED REPAIR (48H)";
        riskBadge.className = "score-badge-status med";
      }
      if (riskActionText) riskActionText.textContent = "Add to Ward Maintenance Route this Week";
      if (riskTwoWheeler) {
        riskTwoWheeler.textContent = "Moderate (Discomfort & Tyre Hazard)";
        riskTwoWheeler.className = "";
      }
    } else {
      if (riskBadge) {
        riskBadge.textContent = "ROUTINE MONITORING";
        riskBadge.className = "score-badge-status low";
      }
      if (riskActionText) riskActionText.textContent = "Log to Continuous Wear Tracking Queue";
      if (riskTwoWheeler) {
        riskTwoWheeler.textContent = "Low Hazard";
        riskTwoWheeler.className = "";
      }
    }

    // Material estimation (Area * ~90 kg per m² of 40mm asphalt mix)
    const bitumenKg = Math.round(area * 95);
    if (riskMixEst) riskMixEst.textContent = `~${bitumenKg} kg Bitumen Asphalt Mix`;
  }

  [inputArea, inputSpeed, toggleSchool, toggleCurve, toggleRain].forEach(el => {
    if (el) el.addEventListener("input", calculateRisk);
  });

  calculateRisk();
}

/* ==========================================================================
   3. SMART CITY GIS MAP & INCIDENT FEED
   ========================================================================== */
function initGisMap() {
  const canvas = document.getElementById("gis-map-canvas");
  const feedContainer = document.getElementById("incident-feed-container");
  if (!canvas || !feedContainer) return;

  const ctx = canvas.getContext("2d");

  const incidents = [
    {
      id: "INC-8092",
      type: "Pothole (Cluster)",
      road: "Outer Ring Road, KM 14.2",
      risk: "high",
      riskVal: 8.8,
      area: "0.58 m²",
      status: "Dispatched",
      x: 180,
      y: 120
    },
    {
      id: "INC-8095",
      type: "Severe Edge Fracture",
      road: "Junction 5 underpass",
      risk: "high",
      riskVal: 8.1,
      area: "0.72 m²",
      status: "Verified",
      x: 340,
      y: 210
    },
    {
      id: "INC-8101",
      type: "Fatigue Alligator Crack",
      road: "Tech Corridor Road 3",
      risk: "medium",
      riskVal: 6.4,
      area: "1.20 m²",
      status: "Scheduled",
      x: 460,
      y: 140
    },
    {
      id: "INC-8079",
      type: "Patched Pothole",
      road: "Market Link Road",
      risk: "resolved",
      riskVal: 1.2,
      area: "0.35 m²",
      status: "Repaired",
      x: 230,
      y: 320
    }
  ];

  let selectedId = incidents[0].id;
  let activeFilter = "all";

  // Filter Buttons
  const filterBtns = document.querySelectorAll(".filter-btn");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.getAttribute("data-filter");
      renderFeed();
      drawMap();
    });
  });

  function renderFeed() {
    feedContainer.innerHTML = "";
    const filtered = incidents.filter(inc => {
      if (activeFilter === "all") return true;
      return inc.risk === activeFilter;
    });

    if (filtered.length === 0) {
      feedContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: #94A3B8;">No incidents match this filter.</div>`;
      return;
    }

    filtered.forEach(inc => {
      const card = document.createElement("div");
      card.className = `incident-card ${inc.id === selectedId ? "active" : ""}`;
      card.innerHTML = `
        <div class="incident-top">
          <span class="incident-id">${inc.id}</span>
          <span class="incident-badge ${inc.risk}">${inc.risk.toUpperCase()} · ${inc.riskVal}</span>
        </div>
        <div class="incident-title">${inc.type}</div>
        <div class="incident-meta">${inc.road} · <strong>Area: ${inc.area}</strong></div>
      `;
      card.addEventListener("click", () => {
        selectedId = inc.id;
        renderFeed();
        drawMap();
      });
      feedContainer.appendChild(card);
    });
  }

  function drawMap() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Dark GIS Map Background
    ctx.fillStyle = "#0B132B";
    ctx.fillRect(0, 0, w, h);

    // Grid Lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Road Arteries
    ctx.strokeStyle = "rgba(71, 85, 105, 0.6)";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";

    // Main Highway 1
    ctx.beginPath();
    ctx.moveTo(40, 80);
    ctx.quadraticCurveTo(250, 180, 560, 110);
    ctx.stroke();

    // Secondary Crossway
    ctx.beginPath();
    ctx.moveTo(120, 360);
    ctx.lineTo(440, 60);
    ctx.stroke();

    // Radial Link
    ctx.beginPath();
    ctx.moveTo(280, 380);
    ctx.quadraticCurveTo(360, 220, 520, 280);
    ctx.stroke();

    // Road Inner Centerlines
    ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Incidents
    incidents.forEach(inc => {
      const isSelected = inc.id === selectedId;
      const isVisible = activeFilter === "all" || inc.risk === activeFilter;

      if (!isVisible) return;

      const color = inc.risk === "high" ? "#EF4444" : inc.risk === "medium" ? "#F59E0B" : "#10B981";

      // Pulsing Outer Radar
      ctx.beginPath();
      ctx.arc(inc.x, inc.y, isSelected ? 18 : 10, 0, Math.PI * 2);
      ctx.fillStyle = `${color}33`;
      ctx.fill();

      // Core Marker Dot
      ctx.beginPath();
      ctx.arc(inc.x, inc.y, isSelected ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.stroke();

      // Tooltip Label on Selected
      if (isSelected) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.fillRect(inc.x - 50, inc.y - 38, 100, 24);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(inc.x - 50, inc.y - 38, 100, 24);

        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 10px 'Plus Jakarta Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(inc.id, inc.x, inc.y - 22);
      }
    });
  }

  renderFeed();
  drawMap();
}

/* ==========================================================================
   4. INTERACTIVE 8-SLIDE PITCH DECK MODAL
   ========================================================================== */
function initPitchDeck() {
  const modal = document.getElementById("deck-modal");
  const openBtn = document.getElementById("open-deck-btn");
  const heroBtn = document.getElementById("hero-deck-btn");
  const closeBtn = document.getElementById("deck-close-btn");
  const prevBtn = document.getElementById("deck-prev-btn");
  const nextBtn = document.getElementById("deck-next-btn");
  const viewport = document.getElementById("deck-viewport");
  const counter = document.getElementById("deck-counter");
  const dotsContainer = document.getElementById("deck-dots-container");
  const fullscreenBtn = document.getElementById("deck-fullscreen-btn");

  if (!modal || !viewport) return;

  const slidesData = [
    {
      num: "Slide 01 · Title & Mission",
      title: "PARDHA ROADSENSE",
      subtitle: "Spotting road hazards before they cause accidents.",
      body: `
        <p style="font-size: 1.15rem; margin-bottom: 16px;"><strong>Team Pardha:</strong> Chandra Johith · YRG Karthikeya · Dasari Sree · Kelam Bhargav</p>
        <p><strong>Hackathon Theme:</strong> Road Safety & Intelligent Infrastructure</p>
        <div style="margin-top: 24px; padding: 16px; background: rgba(37, 99, 235, 0.06); border-radius: 12px; border: 1px solid rgba(37, 99, 235, 0.15);">
          <strong>Visual Concept:</strong> An open highway at daylight with an exact cyan contour outlining an irregular pothole. Clean, high-contrast, professional student presentation.
        </div>
      `,
      note: "Judges, every bad road accident starts days or weeks before the crash. We built Pardha RoadSense to turn ordinary vehicle cameras into an automatic road inspection system."
    },
    {
      num: "Slide 02 · The Problem",
      title: "Our roads warn us for weeks. Nobody is watching.",
      subtitle: "Preventable road damage causes fatal crashes across India every day.",
      body: `
        <ul>
          <li><strong>1.19 Million Deaths:</strong> Lost worldwide on roads each year (WHO).</li>
          <li><strong>9 in 10 Deaths:</strong> Occur in low- and middle-income countries with poor inspection coverage.</li>
          <li><strong>1.5+ Lakh Lives Lost in India:</strong> Two-wheeler commuters bear the heaviest burden (MoRTH).</li>
          <li><strong>The Reality:</strong> Potholes, broken shoulders, and faded markings sit on the tarmac for weeks before anyone intervenes.</li>
        </ul>
      `,
      note: "These roads were warning us long before the ambulance arrived. Nobody was watching."
    },
    {
      num: "Slide 03 · Root Cause",
      title: "Why hazards stay on the road.",
      subtitle: "The legacy inspection model is slow, manual, and reactive.",
      body: `
        <ul>
          <li><strong>Checking is manual:</strong> Inspectors drive around with clipboards once every 6 months. It covers &lt; 5% of roads.</li>
          <li><strong>Fixing waits for a tragedy:</strong> Authorities only find out after someone is hurt or files an angry complaint.</li>
          <li><strong>Zero ranking:</strong> Repairs go where the noise is loudest, not where the hazard is most lethal.</li>
          <li><strong>Footage is wasted:</strong> Buses, taxis, and smartphones record roads all day, and nobody analyzes it.</li>
        </ul>
        <p style="margin-top: 14px;"><strong>Bottom line:</strong> The roads are already being filmed. We just need to read the footage.</p>
      `,
      note: "Right now, repairs go to whoever makes the loudest noise, not to the hazard that is most likely to kill someone tonight. The cameras are already driving."
    },
    {
      num: "Slide 04 · Our Idea",
      title: "Pardha RoadSense: See it. Trace it. Rank it. Fix it.",
      subtitle: "Software-only edge intelligence using existing vehicle dashcams.",
      body: `
        <p>Pardha RoadSense uses existing cameras—like a smartphone on a bus windshield—to audit roads automatically.</p>
        <ul style="margin-top: 14px;">
          <li><strong>1. What it is:</strong> Pothole, alligator crack, broken edge, or faded lane line.</li>
          <li><strong>2. How big it is:</strong> Exact physical surface area and boundary geometry.</li>
          <li><strong>3. Where it is:</strong> Precise GPS coordinates & lane position.</li>
          <li><strong>4. How dangerous it is:</strong> Context-aware 1–10 risk rating.</li>
        </ul>
      `,
      note: "We don't just alert a driver. We capture the defect, calculate its real physical size, tag its GPS location, and tell city engineers which spot to pave first."
    },
    {
      num: "Slide 05 · How It Works",
      title: "The Two-Step Engine: Find fast, then trace precisely.",
      subtitle: "Separating rapid localization from high-precision metrology.",
      body: `
        <ul>
          <li><strong>1. Record:</strong> Vehicle camera captures frames with GPS tags.</li>
          <li><strong>2. Find (YOLO):</strong> Scans frames in ~16ms and drops candidate bounding boxes.</li>
          <li><strong>3. Trace (Meta SAM 2):</strong> Uses the box to trace the exact pixel contour, measuring true physical geometry.</li>
          <li><strong>4. Rank & Report:</strong> Combines size, road speed limit, and school zones into an actionable priority score.</li>
        </ul>
        <p style="margin-top: 14px;"><strong>Privacy & Edge:</strong> Faces and plates are blurred on-device. Works fully offline in dead zones; syncs at depots.</p>
      `,
      note: "Why two steps? A square box around a zigzag pothole captures 50% healthy asphalt. You can't estimate repair volume from a box. YOLO finds it in milliseconds; SAM 2 traces its exact boundary."
    },
    {
      num: "Slide 06 · Tested Benchmark",
      title: "What We Have Tested (Notebook Results)",
      subtitle: "Verified on a dense evaluation benchmark: 93 frames with 4,082 ground-truth objects.",
      body: `
        <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.95rem;">
          <tr style="background: rgba(37,99,235,0.08); font-weight: bold;">
            <td style="padding: 8px;">Metric</td>
            <td style="padding: 8px;">Stage 1: YOLO Alone</td>
            <td style="padding: 8px;">Stage 2: YOLO + SAM 2</td>
          </tr>
          <tr><td style="padding: 8px;">Precision</td><td style="padding: 8px;">0.95</td><td style="padding: 8px;">0.95</td></tr>
          <tr><td style="padding: 8px;">Recall</td><td style="padding: 8px;">0.83</td><td style="padding: 8px;">0.83</td></tr>
          <tr style="font-weight: bold; background: rgba(6,182,212,0.1);"><td style="padding: 8px;">Boundary Accuracy (IoU)</td><td style="padding: 8px;">0.73</td><td style="padding: 8px;">0.86 (+13 points!)</td></tr>
        </table>
        <p style="margin-top: 14px;">The trace step made outlines <strong>13 points more accurate</strong>. The find step processed all 93 frames in <strong>16.1 seconds</strong>.</p>
      `,
      note: "We're upfront: this was verified on a dense micro-feature benchmark to prove the architecture. The find step is lightning-fast, and SAM 2 provides the 13-point leap that makes true measurement possible."
    },
    {
      num: "Slide 07 · Market & Rollout",
      title: "Who It Helps & How We Deploy",
      subtitle: "Zero capital expenditure. Software on wheels.",
      body: `
        <ul>
          <li><strong>Two-Wheeler Riders & Commuters:</strong> Early warnings prevent fatal loss of control.</li>
          <li><strong>City & Highway Authorities:</strong> Road audits take days instead of months; repairs chosen by risk.</li>
          <li><strong>Fleet Operators & Insurers:</strong> Lower suspension damage and fewer claims.</li>
        </ul>
        <div style="margin-top: 16px; padding: 12px; background: rgba(255,255,255,0.8); border-radius: 8px;">
          <strong>Rollout Plan:</strong> Phase 1: 20 km Pilot Corridor (10 bus mounts) → Phase 2: Municipal fleet scale → Phase 3: State Highway GIS Dashboard.
        </div>
      `,
      note: "We don't ask cities for 50,000-dollar LiDAR trucks. We mount phones on public buses already running. By Day 30, the city has a self-updating heatmap of every defect."
    },
    {
      num: "Slide 08 · Roadmap & Conclusion",
      title: "The Road Ahead: Next 30 to 60 Days",
      subtitle: "Taking the pipeline from the lab to the street.",
      body: `
        <ul>
          <li><strong>Next 30 Days:</strong> Train detector directly on road datasets (RDD2020, CRACK500) for potholes, rutting, and signs.</li>
          <li><strong>Next 60 Days:</strong> Benchmark night glare, monsoon rain puddles, and high-speed motion blur.</li>
          <li><strong>Open Engineering:</strong> Waterlogged holes obscure depth; monocular depth estimation is under active development.</li>
        </ul>
        <p style="margin-top: 24px; font-style: italic; font-size: 1.1rem; color: #1E293B;">
          &ldquo;Every road already tells a story of decay long before an accident happens. We are teaching ordinary cameras to read it.&rdquo;
        </p>
      `,
      note: "In the next 30 days, we take these verified weights to city tarmac. We are transparent about the limits—like rain and night glare—and have the plan to solve them. Thank you, judges!"
    }
  ];

  let currentSlide = 0;

  function renderSlide(index) {
    const slide = slidesData[index];
    if (!slide) return;

    if (counter) counter.textContent = `Slide ${index + 1} of ${slidesData.length}`;

    viewport.innerHTML = `
      <div class="deck-slide active">
        <div class="deck-slide-num">${slide.num}</div>
        <h2 class="deck-slide-title">${slide.title}</h2>
        <p style="font-size: 1.15rem; color: #475569; margin-bottom: 20px;">${slide.subtitle}</p>
        <div class="deck-slide-body">${slide.body}</div>
        <div class="deck-speaker-note">
          <strong>Presenter Note (Say to Judges):</strong> "${slide.note}"
        </div>
      </div>
    `;

    // Render Dots
    if (dotsContainer) {
      dotsContainer.innerHTML = "";
      slidesData.forEach((_, i) => {
        const dot = document.createElement("div");
        dot.className = `deck-dot ${i === index ? "active" : ""}`;
        dot.addEventListener("click", () => {
          currentSlide = i;
          renderSlide(currentSlide);
        });
        dotsContainer.appendChild(dot);
      });
    }

    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) {
      if (index === slidesData.length - 1) {
        nextBtn.innerHTML = `<span>Finish Deck</span>`;
      } else {
        nextBtn.innerHTML = `<span>Next Slide</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
      }
    }
  }

  function openDeck() {
    modal.classList.add("active");
    renderSlide(currentSlide);
    document.body.style.overflow = "hidden";
  }

  function closeDeck() {
    modal.classList.remove("active");
    document.body.style.overflow = "";
  }

  if (openBtn) openBtn.addEventListener("click", openDeck);
  if (heroBtn) heroBtn.addEventListener("click", openDeck);
  if (closeBtn) closeBtn.addEventListener("click", closeDeck);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeDeck();
  });

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentSlide > 0) {
        currentSlide--;
        renderSlide(currentSlide);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentSlide < slidesData.length - 1) {
        currentSlide++;
        renderSlide(currentSlide);
      } else {
        closeDeck();
      }
    });
  }

  // Keyboard Navigation
  window.addEventListener("keydown", (e) => {
    if (!modal.classList.contains("active")) return;
    if (e.key === "ArrowRight" || e.key === "Space") {
      if (currentSlide < slidesData.length - 1) {
        currentSlide++;
        renderSlide(currentSlide);
      }
    } else if (e.key === "ArrowLeft") {
      if (currentSlide > 0) {
        currentSlide--;
        renderSlide(currentSlide);
      }
    } else if (e.key === "Escape") {
      closeDeck();
    }
  });

  // Fullscreen Toggle
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      const modalCont = document.querySelector(".deck-modal-container");
      if (!document.fullscreenElement) {
        if (modalCont.requestFullscreen) modalCont.requestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    });
  }
}
