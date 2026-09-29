/**
 * L2 STP BLK & VLAN Risk Calculator Engine
 * Runs completely on client-side browser
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Core Form & Input DOM Elements
  const form = document.getElementById('calc-form');
  const workType = document.getElementById('workType');
  const portType = document.getElementById('portType');
  const portStpState = document.getElementById('portStpState');
  const vlanInput = document.getElementById('vlanInput');
  const stpMode = document.getElementById('stpMode');
  const guardBpdu = document.getElementById('guardBpdu');
  const guardRoot = document.getElementById('guardRoot');
  const guardLoop = document.getElementById('guardLoop');
  const portfast = document.getElementById('portfast');
  const switchportAllowedAll = document.getElementById('switchportAllowedAll');
  const hasNativeVlanMismatch = document.getElementById('hasNativeVlanMismatch');
  const workWindow = document.getElementById('workWindow');
  const vlanCountTotal = document.getElementById('vlanCountTotal');
  const broadcastRate = document.getElementById('broadcastRate');

  // 2. Topology & Switch State Management
  const topologyData = {
    type: 'triangle', // triangle, ring, mesh
    selectedSwitchId: 'SW-DIST1',
    selectedLinkId: 'L3', // currently selected link interface
    switches: {
      'SW-DIST1': { id: 'SW-DIST1', name: 'Distribution 1', role: 'dist', priority: 4096, x: 210, y: 70 },
      'SW-DIST2': { id: 'SW-DIST2', name: 'Distribution 2', role: 'dist', priority: 8192, x: 470, y: 70 },
      'SW-ACC1':  { id: 'SW-ACC1',  name: 'Access Switch 1', role: 'access', priority: 32768, x: 340, y: 235 }
    },
    links: [
      { id: 'L1', name: 'L1: DIST1(Gi0/1) ↔ DIST2(Gi0/1)', from: 'SW-DIST1', to: 'SW-DIST2', fromPort: 'Gi0/1', toPort: 'Gi0/1', cost: 4, portPriority: 128, state: 'fwd', isTarget: false },
      { id: 'L2', name: 'L2: DIST1(Gi0/2) ↔ ACC1(Gi0/1)',  from: 'SW-DIST1', to: 'SW-ACC1',  fromPort: 'Gi0/2', toPort: 'Gi0/1', cost: 4, portPriority: 128, state: 'fwd', isTarget: false },
      { id: 'L3', name: 'L3: DIST2(Gi0/2) ↔ ACC1(Gi0/2)',  from: 'SW-DIST2', to: 'SW-ACC1',  fromPort: 'Gi0/2', toPort: 'Gi0/2', cost: 4, portPriority: 128, state: 'blk', isTarget: true }
    ]
  };

  // 3. Topology GUI DOM Elements
  const topologySvg = document.getElementById('topologySvg');
  const topologyLinksGroup = document.getElementById('topologyLinks');
  const topologyNodesGroup = document.getElementById('topologyNodes');
  const topologyLabelsGroup = document.getElementById('topologyLabels');

  // Tabs DOM Elements
  const tabBtnSwitch = document.getElementById('tabBtnSwitch');
  const tabBtnLink = document.getElementById('tabBtnLink');
  const switchEditorCard = document.getElementById('switchEditorCard');
  const linkEditorCard = document.getElementById('linkEditorCard');
  const tabSwitchTitle = document.getElementById('tabSwitchTitle');
  const tabLinkTitle = document.getElementById('tabLinkTitle');

  // Switch Editor DOM Elements
  const editorSwitchTypeBadge = document.getElementById('editorSwitchTypeBadge');
  const editorSwitchName = document.getElementById('editorSwitchName');
  const editorIsRootIndicator = document.getElementById('editorIsRootIndicator');
  const editSwitchPriority = document.getElementById('editSwitchPriority');
  const redundantTopology = document.getElementById('redundantTopology');

  // Link / Interface Editor DOM Elements
  const linkSelectDropdown = document.getElementById('linkSelectDropdown');
  const editorLinkBadge = document.getElementById('editorLinkBadge');
  const editorLinkEndpoints = document.getElementById('editorLinkEndpoints');
  const editorLinkWorkBadge = document.getElementById('editorLinkWorkBadge');
  const editLinkState = document.getElementById('editLinkState');
  const editPortCost = document.getElementById('editPortCost');
  const presetPortCost = document.getElementById('presetPortCost');
  const editPortPriority = document.getElementById('editPortPriority');
  const btnSetAsWorkTarget = document.getElementById('btnSetAsWorkTarget');
  const btnToggleLinkState = document.getElementById('btnToggleLinkState');

  // 4. Result & Metrics DOM Elements
  const riskScoreEl = document.getElementById('riskScore');
  const gaugeCircle = document.getElementById('gaugeCircle');
  const riskBadge = document.getElementById('riskBadge');
  const riskSummaryTitle = document.getElementById('riskSummaryTitle');
  const riskSummaryDesc = document.getElementById('riskSummaryDesc');
  const loopProbEl = document.getElementById('loopProb');
  const loopProbDetail = document.getElementById('loopProbDetail');
  const flapDurationEl = document.getElementById('flapDuration');
  const flapDurationDetail = document.getElementById('flapDurationDetail');
  const tcnImpactEl = document.getElementById('tcnImpact');
  const tcnImpactDetail = document.getElementById('tcnImpactDetail');
  const scenarioList = document.getElementById('scenarioList');
  const checklistItems = document.getElementById('checklistItems');
  const cliSnippet = document.getElementById('cliSnippet');
  const toast = document.getElementById('toast');

  const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 68; // 427.26

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // Tab switching logic
  function switchTab(mode) {
    if (mode === 'switch') {
      tabBtnSwitch.classList.add('active');
      tabBtnLink.classList.remove('active');
      switchEditorCard.style.display = 'block';
      linkEditorCard.style.display = 'none';
    } else {
      tabBtnLink.classList.add('active');
      tabBtnSwitch.classList.remove('active');
      switchEditorCard.style.display = 'none';
      linkEditorCard.style.display = 'block';
    }
  }

  if (tabBtnSwitch) tabBtnSwitch.addEventListener('click', () => switchTab('switch'));
  if (tabBtnLink) tabBtnLink.addEventListener('click', () => switchTab('link'));

  // Find Root Bridge
  function getRootBridgeId() {
    let minPri = Infinity;
    let rootId = 'SW-DIST1';
    Object.values(topologyData.switches).forEach(sw => {
      if (sw.priority < minPri) {
        minPri = sw.priority;
        rootId = sw.id;
      }
    });
    return rootId;
  }

  // Update Topology layout nodes & links
  function updateTopologyLayout(type) {
    topologyData.type = type;
    if (type === 'triangle') {
      topologyData.switches = {
        'SW-DIST1': { id: 'SW-DIST1', name: 'Distribution 1', role: 'dist', priority: topologyData.switches['SW-DIST1']?.priority || 4096, x: 210, y: 70 },
        'SW-DIST2': { id: 'SW-DIST2', name: 'Distribution 2', role: 'dist', priority: topologyData.switches['SW-DIST2']?.priority || 8192, x: 470, y: 70 },
        'SW-ACC1':  { id: 'SW-ACC1',  name: 'Access Switch 1', role: 'access', priority: topologyData.switches['SW-ACC1']?.priority || 32768, x: 340, y: 235 }
      };
      topologyData.links = [
        { id: 'L1', name: 'L1: DIST1(Gi0/1) ↔ DIST2(Gi0/1)', from: 'SW-DIST1', to: 'SW-DIST2', fromPort: 'Gi0/1', toPort: 'Gi0/1', cost: 4, portPriority: 128, state: 'fwd', isTarget: false },
        { id: 'L2', name: 'L2: DIST1(Gi0/2) ↔ ACC1(Gi0/1)',  from: 'SW-DIST1', to: 'SW-ACC1',  fromPort: 'Gi0/2', toPort: 'Gi0/1', cost: 4, portPriority: 128, state: 'fwd', isTarget: false },
        { id: 'L3', name: 'L3: DIST2(Gi0/2) ↔ ACC1(Gi0/2)',  from: 'SW-DIST2', to: 'SW-ACC1',  fromPort: 'Gi0/2', toPort: 'Gi0/2', cost: 4, portPriority: 128, state: 'blk', isTarget: true }
      ];
    } else if (type === 'ring') {
      topologyData.switches = {
        'SW-DIST1': { id: 'SW-DIST1', name: 'Distribution 1', role: 'dist', priority: topologyData.switches['SW-DIST1']?.priority || 4096, x: 190, y: 70 },
        'SW-DIST2': { id: 'SW-DIST2', name: 'Distribution 2', role: 'dist', priority: topologyData.switches['SW-DIST2']?.priority || 8192, x: 490, y: 70 },
        'SW-ACC1':  { id: 'SW-ACC1',  name: 'Access Switch 1', role: 'access', priority: topologyData.switches['SW-ACC1']?.priority || 32768, x: 190, y: 235 },
        'SW-ACC2':  { id: 'SW-ACC2',  name: 'Access Switch 2', role: 'access', priority: topologyData.switches['SW-ACC2']?.priority || 32768, x: 490, y: 235 }
      };
      topologyData.links = [
        { id: 'L1', name: 'L1: DIST1(Gi0/1) ↔ DIST2(Gi0/1)', from: 'SW-DIST1', to: 'SW-DIST2', fromPort: 'Gi0/1', toPort: 'Gi0/1', cost: 4, portPriority: 128, state: 'fwd', isTarget: false },
        { id: 'L2', name: 'L2: DIST1(Gi0/2) ↔ ACC1(Gi0/1)',  from: 'SW-DIST1', to: 'SW-ACC1',  fromPort: 'Gi0/2', toPort: 'Gi0/1', cost: 4, portPriority: 128, state: 'fwd', isTarget: false },
        { id: 'L3', name: 'L3: DIST2(Gi0/2) ↔ ACC2(Gi0/1)',  from: 'SW-DIST2', to: 'SW-ACC2',  fromPort: 'Gi0/2', toPort: 'Gi0/1', cost: 4, portPriority: 128, state: 'fwd', isTarget: false },
        { id: 'L4', name: 'L4: ACC1(Gi0/2) ↔ ACC2(Gi0/2)',   from: 'SW-ACC1',  to: 'SW-ACC2',  fromPort: 'Gi0/2', toPort: 'Gi0/2', cost: 4, portPriority: 128, state: 'blk', isTarget: true }
      ];
    } else if (type === 'mesh') {
      topologyData.switches = {
        'SW-DIST1': { id: 'SW-DIST1', name: 'Distribution 1', role: 'dist', priority: topologyData.switches['SW-DIST1']?.priority || 4096, x: 190, y: 70 },
        'SW-DIST2': { id: 'SW-DIST2', name: 'Distribution 2', role: 'dist', priority: topologyData.switches['SW-DIST2']?.priority || 8192, x: 490, y: 70 },
        'SW-ACC1':  { id: 'SW-ACC1',  name: 'Access Switch 1', role: 'access', priority: topologyData.switches['SW-ACC1']?.priority || 32768, x: 190, y: 235 },
        'SW-ACC2':  { id: 'SW-ACC2',  name: 'Access Switch 2', role: 'access', priority: topologyData.switches['SW-ACC2']?.priority || 32768, x: 490, y: 235 }
      };
      topologyData.links = [
        { id: 'L1', name: 'L1: DIST1 ↔ DIST2', from: 'SW-DIST1', to: 'SW-DIST2', fromPort: 'Gi0/1', toPort: 'Gi0/1', cost: 4, portPriority: 128, state: 'fwd', isTarget: false },
        { id: 'L2', name: 'L2: DIST1 ↔ ACC1',  from: 'SW-DIST1', to: 'SW-ACC1',  fromPort: 'Gi0/2', toPort: 'Gi0/1', cost: 4, portPriority: 128, state: 'fwd', isTarget: false },
        { id: 'L3', name: 'L3: DIST2 ↔ ACC2',  from: 'SW-DIST2', to: 'SW-ACC2',  fromPort: 'Gi0/2', toPort: 'Gi0/1', cost: 4, portPriority: 128, state: 'fwd', isTarget: false },
        { id: 'L4', name: 'L4: ACC1 ↔ ACC2',   from: 'SW-ACC1',  to: 'SW-ACC2',  fromPort: 'Gi0/2', toPort: 'Gi0/2', cost: 4, portPriority: 128, state: 'blk', isTarget: false },
        { id: 'L5', name: 'L5: DIST1 ↔ ACC2',  from: 'SW-DIST1', to: 'SW-ACC2',  fromPort: 'Gi0/3', toPort: 'Gi0/3', cost: 4, portPriority: 128, state: 'blk', isTarget: true },
        { id: 'L6', name: 'L6: DIST2 ↔ ACC1',  from: 'SW-DIST2', to: 'SW-ACC1',  fromPort: 'Gi0/3', toPort: 'Gi0/3', cost: 4, portPriority: 128, state: 'fwd', isTarget: false }
      ];
    }

    if (!topologyData.switches[topologyData.selectedSwitchId]) {
      topologyData.selectedSwitchId = Object.keys(topologyData.switches)[0];
    }

    const targetLink = topologyData.links.find(l => l.isTarget) || topologyData.links[0];
    topologyData.selectedLinkId = targetLink.id;

    populateLinkDropdown();
  }

  // Populate link selection dropdown
  function populateLinkDropdown() {
    if (!linkSelectDropdown) return;
    linkSelectDropdown.innerHTML = '';
    topologyData.links.forEach(link => {
      const opt = document.createElement('option');
      opt.value = link.id;
      opt.textContent = `${link.name} [${link.state.toUpperCase()}, Cost:${link.cost}]${link.isTarget ? ' ★작업대상' : ''}`;
      if (link.id === topologyData.selectedLinkId) {
        opt.selected = true;
      }
      linkSelectDropdown.appendChild(opt);
    });
  }

  // Draw GUI Topology onto SVG
  function renderTopologyGUI() {
    if (!topologyLinksGroup || !topologyNodesGroup || !topologyLabelsGroup) return;

    const rootId = getRootBridgeId();
    const currentSelectedSw = topologyData.switches[topologyData.selectedSwitchId] || Object.values(topologyData.switches)[0];

    // Clear previous SVG elements
    topologyLinksGroup.innerHTML = '';
    topologyNodesGroup.innerHTML = '';
    topologyLabelsGroup.innerHTML = '';

    // Draw Links
    topologyData.links.forEach(link => {
      const source = topologyData.switches[link.from];
      const target = topologyData.switches[link.to];
      if (!source || !target) return;

      const isTargetWork = link.isTarget;
      const isSelectedLink = link.id === topologyData.selectedLinkId;
      const isBlk = link.state === 'blk';

      // SVG Line
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', source.x);
      line.setAttribute('y1', source.y);
      line.setAttribute('x2', target.x);
      line.setAttribute('y2', target.y);
      line.setAttribute('class', `topo-link ${isBlk ? 'link-blk' : 'link-fwd'} ${isTargetWork ? 'link-target' : ''}`);

      if (isSelectedLink && !isTargetWork) {
        line.style.stroke = '#38bdf8';
        line.style.strokeWidth = '4.5';
      }

      line.addEventListener('click', () => {
        selectLink(link.id);
      });

      topologyLinksGroup.appendChild(line);

      // Label on Link
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;

      const gLabel = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      gLabel.setAttribute('transform', `translate(${midX}, ${midY})`);
      gLabel.style.cursor = 'pointer';

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', -40);
      rect.setAttribute('y', -11);
      rect.setAttribute('width', 80);
      rect.setAttribute('height', 22);
      rect.setAttribute('class', 'topo-label-bg');

      if (isTargetWork) {
        rect.style.stroke = '#ef4444';
        rect.style.strokeWidth = '1.8';
      } else if (isSelectedLink) {
        rect.style.stroke = '#38bdf8';
        rect.style.strokeWidth = '1.5';
      }

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', 0);
      text.setAttribute('y', 0);
      text.setAttribute('class', 'topo-label-text');
      text.textContent = `${isTargetWork ? '★ ' : ''}${link.state.toUpperCase()} (C:${link.cost})`;

      gLabel.appendChild(rect);
      gLabel.appendChild(text);

      gLabel.addEventListener('click', (e) => {
        e.stopPropagation();
        selectLink(link.id);
      });

      topologyLabelsGroup.appendChild(gLabel);
    });

    // Draw Switches
    Object.values(topologyData.switches).forEach(sw => {
      const isRoot = sw.id === rootId;
      const isSelected = sw.id === topologyData.selectedSwitchId;

      const gNode = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      gNode.setAttribute('transform', `translate(${sw.x}, ${sw.y})`);
      gNode.setAttribute('class', `topo-node ${isRoot ? 'is-root' : ''} ${isSelected ? 'is-selected' : ''}`);

      const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      box.setAttribute('x', -60);
      box.setAttribute('y', -24);
      box.setAttribute('width', 120);
      box.setAttribute('height', 48);
      box.setAttribute('class', 'topo-node-box');

      const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      title.setAttribute('x', 0);
      title.setAttribute('y', -4);
      title.setAttribute('class', 'topo-node-title');
      title.textContent = (isRoot ? '👑 ' : '') + sw.id;

      const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      sub.setAttribute('x', 0);
      sub.setAttribute('y', 14);
      sub.setAttribute('class', 'topo-node-sub');
      sub.textContent = `Pri: ${sw.priority}`;

      gNode.appendChild(box);
      gNode.appendChild(title);
      gNode.appendChild(sub);

      gNode.addEventListener('click', () => {
        selectSwitch(sw.id);
      });

      topologyNodesGroup.appendChild(gNode);
    });

    updateSwitchEditorPanel(currentSelectedSw);
    updateLinkEditorPanel();
  }

  // Select Switch action
  function selectSwitch(switchId) {
    topologyData.selectedSwitchId = switchId;
    const sw = topologyData.switches[switchId];
    updateSwitchEditorPanel(sw);
    switchTab('switch');
    renderTopologyGUI();
    calculateRisk();
  }

  // Select Link action
  function selectLink(linkId) {
    topologyData.selectedLinkId = linkId;
    updateLinkEditorPanel();
    switchTab('link');
    renderTopologyGUI();
    calculateRisk();
    const link = topologyData.links.find(l => l.id === linkId);
    if (link) {
      showToast(`인터페이스 [${link.name}] 설정 패널이 활성화되었습니다.`);
    }
  }

  // Update Switch Editor panel
  function updateSwitchEditorPanel(sw) {
    if (!sw) return;
    const isRoot = sw.id === getRootBridgeId();
    if (tabSwitchTitle) tabSwitchTitle.textContent = sw.id;
    if (editorSwitchTypeBadge) editorSwitchTypeBadge.textContent = sw.role.toUpperCase();
    if (editorSwitchName) editorSwitchName.textContent = `${sw.id} (${sw.name})`;
    if (editorIsRootIndicator) editorIsRootIndicator.classList.toggle('active', isRoot);
    if (editSwitchPriority) editSwitchPriority.value = String(sw.priority);
  }

  // Update Link Editor panel
  function updateLinkEditorPanel() {
    const link = topologyData.links.find(l => l.id === topologyData.selectedLinkId) || topologyData.links[0];
    if (!link) return;

    if (tabLinkTitle) tabLinkTitle.textContent = `${link.from} ↔ ${link.to}`;
    if (editorLinkBadge) editorLinkBadge.textContent = `LINK: ${link.id}`;
    if (editorLinkEndpoints) editorLinkEndpoints.textContent = `${link.from}(${link.fromPort}) ↔ ${link.to}(${link.toPort})`;
    if (editorLinkWorkBadge) editorLinkWorkBadge.classList.toggle('active', link.isTarget);

    if (linkSelectDropdown) linkSelectDropdown.value = link.id;
    if (editLinkState) editLinkState.value = link.state;
    if (editPortCost) editPortCost.value = String(link.cost);
    if (editPortPriority) editPortPriority.value = String(link.portPriority || 128);

    // Sync with global Port STP State dropdown if this link is target
    if (link.isTarget && portStpState) {
      portStpState.value = link.state === 'blk' ? 'blocking' : 'forwarding';
    }
  }

  // Switch Editor Event Listeners
  if (editSwitchPriority) {
    editSwitchPriority.addEventListener('change', () => {
      const sw = topologyData.switches[topologyData.selectedSwitchId];
      if (sw) {
        sw.priority = Number(editSwitchPriority.value);
        renderTopologyGUI();
        calculateRisk();
        showToast(`${sw.id}의 Priority가 ${sw.priority}로 변경되었습니다.`);
      }
    });
  }

  if (redundantTopology) {
    redundantTopology.addEventListener('change', () => {
      updateTopologyLayout(redundantTopology.value);
      renderTopologyGUI();
      calculateRisk();
      showToast(`토폴로지가 '${redundantTopology.options[redundantTopology.selectedIndex].text}' 형태로 변경되었습니다.`);
    });
  }

  // Link Editor Event Listeners
  if (linkSelectDropdown) {
    linkSelectDropdown.addEventListener('change', () => {
      selectLink(linkSelectDropdown.value);
    });
  }

  if (editLinkState) {
    editLinkState.addEventListener('change', () => {
      const link = topologyData.links.find(l => l.id === topologyData.selectedLinkId);
      if (link) {
        link.state = editLinkState.value;
        if (link.isTarget && portStpState) {
          portStpState.value = link.state === 'blk' ? 'blocking' : 'forwarding';
        }
        populateLinkDropdown();
        renderTopologyGUI();
        calculateRisk();
        showToast(`인터페이스 [${link.name}] 상태가 ${link.state.toUpperCase()}로 변경되었습니다.`);
      }
    });
  }

  if (editPortCost) {
    editPortCost.addEventListener('input', () => {
      const link = topologyData.links.find(l => l.id === topologyData.selectedLinkId);
      if (link) {
        link.cost = Number(editPortCost.value) || 4;
        populateLinkDropdown();
        renderTopologyGUI();
        calculateRisk();
      }
    });
  }

  if (presetPortCost) {
    presetPortCost.addEventListener('change', () => {
      if (presetPortCost.value && editPortCost) {
        editPortCost.value = presetPortCost.value;
        editPortCost.dispatchEvent(new Event('input'));
      }
    });
  }

  if (editPortPriority) {
    editPortPriority.addEventListener('change', () => {
      const link = topologyData.links.find(l => l.id === topologyData.selectedLinkId);
      if (link) {
        link.portPriority = Number(editPortPriority.value);
        calculateRisk();
      }
    });
  }

  if (btnSetAsWorkTarget) {
    btnSetAsWorkTarget.addEventListener('click', () => {
      const link = topologyData.links.find(l => l.id === topologyData.selectedLinkId);
      if (link) {
        topologyData.links.forEach(l => l.isTarget = false);
        link.isTarget = true;
        if (portStpState) {
          portStpState.value = link.state === 'blk' ? 'blocking' : 'forwarding';
        }
        populateLinkDropdown();
        renderTopologyGUI();
        calculateRisk();
        showToast(`[${link.name}]이 현재 작업/테스트 대상 인터페이스로 지정되었습니다.`);
      }
    });
  }

  if (btnToggleLinkState) {
    btnToggleLinkState.addEventListener('click', () => {
      const link = topologyData.links.find(l => l.id === topologyData.selectedLinkId);
      if (link) {
        link.state = link.state === 'blk' ? 'fwd' : 'blk';
        editLinkState.value = link.state;
        if (link.isTarget && portStpState) {
          portStpState.value = link.state === 'blk' ? 'blocking' : 'forwarding';
        }
        populateLinkDropdown();
        renderTopologyGUI();
        calculateRisk();
        showToast(`[${link.name}]의 STP 상태가 ${link.state.toUpperCase()}로 전환되었습니다.`);
      }
    });
  }

  // Parse VLAN String
  function parseVlanList(vlanStr) {
    if (!vlanStr) return [];
    const cleaned = vlanStr.trim();
    if (!cleaned) return [];
    const parts = cleaned.split(',');
    const vlanSet = new Set();

    parts.forEach(part => {
      const p = part.trim();
      if (p.includes('-')) {
        const [start, end] = p.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = start; i <= end; i++) {
            if (i >= 1 && i <= 4094) vlanSet.add(i);
          }
        }
      } else {
        const num = Number(p);
        if (!isNaN(num) && num >= 1 && num <= 4094) {
          vlanSet.add(num);
        }
      }
    });
    return Array.from(vlanSet);
  }

  // Main Risk Calculation Engine
  function calculateRisk() {
    let score = 15;
    let loopProbability = 5;
    let flapSeconds = 0;
    let tcnScope = 'Local Port';
    const scenarios = [];

    const vlans = vlanInput ? parseVlanList(vlanInput.value) : [];
    const isTrunk = portType ? portType.value === 'trunk' : true;
    const isAccess = portType ? portType.value === 'access' : false;

    // Topology & Target Link Info
    const rootId = getRootBridgeId();
    const targetLink = topologyData.links.find(l => l.isTarget) || topologyData.links[0];
    const isBlkPort = targetLink ? targetLink.state === 'blk' : true;
    const currentCost = targetLink ? targetLink.cost : 4;
    const sourceSw = topologyData.switches[targetLink.from] || topologyData.switches['SW-DIST1'];
    const targetSw = topologyData.switches[targetLink.to] || topologyData.switches['SW-DIST2'];
    const isRootInvolved = sourceSw.id === rootId || targetSw.id === rootId;

    /* --- Factor 1: STP Mode & Convergence Time --- */
    const currentStpMode = stpMode ? stpMode.value : 'rapid_pvst';
    switch (currentStpMode) {
      case 'none':
        score += 50;
        loopProbability += 65;
        flapSeconds = 999;
        scenarios.push({
          level: 'critical',
          text: '<strong>STP 비활성화 (No Spanning Tree):</strong> 물리적 루프 경로 존재 시 0.1초 이내에 브로드캐스트 스톰 발생 및 CPU 100% 포화로 스위치 행업(Hang)이 즉각 발생합니다.'
        });
        break;
      case 'stp': // 802.1D
        score += 25;
        loopProbability += 15;
        flapSeconds = 30;
        scenarios.push({
          level: 'high',
          text: '<strong>레거시 STP(802.1D) 지연:</strong> 포트 상태 전이에 30~50초의 Listening/Learning 지연이 발생하여 해당 VLAN의 모든 단말에서 일시적 세션 끊김 현상이 발생합니다.'
        });
        break;
      case 'pvst':
        score += 15;
        loopProbability += 10;
        flapSeconds = 30;
        scenarios.push({
          level: 'medium',
          text: `<strong>PVST+ 독립 인스턴스 부하:</strong> VLAN마다 독립 STP 계산 수행으로 총 ${vlanCountTotal ? vlanCountTotal.value : 35}개 VLAN의 BPDU 처리 부하 및 30초 수렴 타이머가 적용됩니다.`
        });
        break;
      case 'rapid_pvst':
      case 'rstp':
        flapSeconds = 1.5;
        score += 0;
        loopProbability += 3;
        break;
      case 'mstp':
        flapSeconds = 1.0;
        score += 2;
        break;
    }

    /* --- Factor 2: Selected Link Interface BLK State & Cost Impact --- */
    if (isBlkPort) {
      score += 24;
      loopProbability += 20;
      scenarios.push({
        level: 'high',
        text: `<strong>BLK(대기) 인터페이스 대상 작업 주의 [구간: ${targetLink.name}, Cost: ${currentCost}]:</strong> 현재 선택된 인터페이스는 STP 엔진에 의해 인위적으로 차단된 링크입니다. 포트 강제 활성화나 Cost 임의 인하 시 대체 경로가 없는 상태에서 일시적 루프가 형성될 수 있습니다.`
      });

      const currentWorkType = workType ? workType.value : 'vlan_add_trunk';
      if (currentWorkType === 'blk_up') {
        score += 25;
        loopProbability += 25;
        scenarios.push({
          level: 'critical',
          text: '<strong>BLK 포트 강제 활성화 (Unblock / Cost 최우선 변경):</strong> 반대편 스위치와의 BPDU 협상이 완료되기 전 Forwarding으로 강제 전이될 경우, 양방향 포워딩으로 인한 즉각적인 L2 Loop가 발생합니다.'
        });
      } else if (currentWorkType === 'blk_down') {
        score += 10;
        scenarios.push({
          level: 'low',
          text: '<strong>BLK 포트 분리/다운:</strong> 평상시 비활성 예비 경로이므로 즉각적인 패킷 드롭은 없으나, 주 링크(Active) 장애 시 자동 절체(Failover) 능력이 영구 상실됩니다.'
        });
      }
    }

    /* --- Factor 3: Topology Factor --- */
    const topoType = redundantTopology ? redundantTopology.value : 'triangle';
    switch (topoType) {
      case 'ring':
        score += 16;
        loopProbability += 16;
        scenarios.push({
          level: 'high',
          text: '<strong>환형(Ring) 4대 루프 토폴로지:</strong> 링 구조는 단 한 번의 STP 불일치나 BPDU 유실로도 전체 링 구간 스위치 패킷이 무한 순환을 일으킵니다.'
        });
        break;
      case 'mesh':
        score += 20;
        loopProbability += 22;
        scenarios.push({
          level: 'critical',
          text: '<strong>Full Mesh 다중 경로:</strong> 다수의 BLK 포트와 교차 링크가 얽혀 있어 TCN 발생 시 MAC 테이블 플러싱이 연쇄적으로 일어나며 루프 형성 가능성이 매우 높습니다.'
        });
        break;
      case 'triangle':
        score += 8;
        loopProbability += 8;
        break;
    }

    /* --- Factor 4: Root Bridge Proximity --- */
    if (isRootInvolved) {
      score += 14;
      tcnScope = '전체 네트워크 (Root Bridge 직속 전역)';
      scenarios.push({
        level: 'critical',
        text: `<strong>👑 Root Bridge 직결 인터페이스 [Root: ${rootId}]:</strong> 선택된 작업 구간이 Root Bridge와 직접 연결되어 있습니다. 이 링크에서의 상태 변화는 STP 트리 전체의 재계산 및 전역 BPDU 플래그 전파를 주도합니다.`
      });
    } else {
      tcnScope = isTrunk ? '상위 업링크 및 연계 VLAN' : '해당 엑세스 포트 단말';
    }

    /* --- Factor 5: Cost Imbalance --- */
    if (currentCost <= 2 && isBlkPort) {
      score += 10;
      loopProbability += 10;
      scenarios.push({
        level: 'medium',
        text: `<strong>초고속 인터페이스(Cost: ${currentCost}) 차단 상태:</strong> 10G/40G 대역폭 링크가 BLK로 묶여 있어 작업 시 STP 토폴로지 재계산 우선순위가 급변할 수 있습니다.`
      });
    }

    /* --- Factor 6: Broadcast / Multicast Volume --- */
    if (broadcastRate && broadcastRate.value === 'high') {
      score += 10;
      loopProbability += 8;
    } else if (broadcastRate && broadcastRate.value === 'extreme') {
      score += 18;
      loopProbability += 15;
      scenarios.push({
        level: 'critical',
        text: '<strong>극단적 브로드캐스트 환경:</strong> 트래픽 유입량이 극도로 높아 루프 형성 시 1초 이내에 대역폭 고갈 및 스위치 컨트롤 플레인 마비가 발생합니다.'
      });
    }

    /* --- Factor 7: VLAN Configuration & Mistake Risks --- */
    if (switchportAllowedAll && switchportAllowedAll.checked) {
      score += 30;
      scenarios.push({
        level: 'critical',
        text: '<strong>[최고 위험 경고] switchport trunk allowed vlan 덮어쓰기 실수:</strong> "add" 키워드를 누락하고 실행하면 기존에 허용되어 있던 수십~수백 개의 VLAN이 일괄 차단되어 대형 통신 두절 사고가 발생합니다.'
      });
    }

    if (hasNativeVlanMismatch && hasNativeVlanMismatch.checked) {
      score += 15;
      loopProbability += 12;
      scenarios.push({
        level: 'high',
        text: '<strong>Native VLAN 불일치:</strong> Cisco PVST/R-PVST는 Native VLAN이 다를 경우 "PVID Inconsistency"를 감지하여 해당 포트를 자동으로 차단(Type Inconsistent BLK)합니다.'
      });
    }

    if (portfast && portfast.checked && isTrunk) {
      score += 25;
      loopProbability += 30;
      scenarios.push({
        level: 'critical',
        text: '<strong>트렁크 포트에 PortFast 설정됨:</strong> PortFast가 활성화된 트렁크 링크에 스위치가 연결되면 STP Listen/Learn 과정을 생략하고 즉시 Forwarding 상태가 되어 즉각적인 Loop가 발생합니다.'
      });
    }

    /* --- Factor 8: Protection Features Mitigation --- */
    let protectionMitigations = 0;
    if (guardBpdu && guardBpdu.checked) {
      protectionMitigations += 4;
      if (isAccess) {
        loopProbability = Math.max(1, loopProbability - 10);
      }
    }
    if (guardRoot && guardRoot.checked) protectionMitigations += 4;
    if (guardLoop && guardLoop.checked) {
      protectionMitigations += 6;
      loopProbability = Math.max(1, loopProbability - 8);
    }
    score = Math.max(5, score - protectionMitigations);

    /* --- Factor 9: Work Window Penalty --- */
    if (workWindow && workWindow.value === 'business') {
      score += 12;
    }

    // Clamp values
    score = Math.min(100, Math.max(5, Math.round(score)));
    loopProbability = Math.min(99, Math.max(1, Math.round(loopProbability)));

    // Render Metrics
    renderResults({
      score,
      loopProbability,
      flapSeconds,
      tcnScope,
      scenarios,
      isBlkPort,
      isTrunk,
      isAccess,
      vlans,
      targetLink,
      sourceSw,
      targetSw,
      isRootInvolved,
      currentCost
    });
  }

  // Render Visual Results
  function renderResults(data) {
    const { score, loopProbability, flapSeconds, tcnScope, scenarios } = data;

    // 1. Risk Score & Gauge
    if (riskScoreEl) riskScoreEl.textContent = score;
    if (gaugeCircle) {
      const offset = CIRCLE_CIRCUMFERENCE - (score / 100) * CIRCLE_CIRCUMFERENCE;
      gaugeCircle.style.strokeDashoffset = offset;
    }

    let levelText = '안전 (LOW)';
    let levelColor = 'var(--risk-low)';
    let title = '안전한 작업 환경';
    let desc = '설정된 보호 기능과 STP 아키텍처로 인해 위험이 낮습니다. 표준 절차에 따라 작업 가능합니다.';

    if (score >= 75) {
      levelText = '심각한 위험 (CRITICAL)';
      levelColor = 'var(--risk-critical)';
      title = '루프 발생 및 대규모 통신 두절 경보';
      desc = '현재 조건은 STP 루프, 전역 MAC 플래핑, 또는 허용 VLAN 일괄 삭제 위험이 극히 높습니다. 사전 조치 후 작업을 진행하십시오.';
    } else if (score >= 50) {
      levelText = '높은 위험 (HIGH)';
      levelColor = 'var(--risk-high)';
      title = '장애 발생 가능성 높음';
      desc = 'BLK 포트 전환 또는 TCN 전파로 인해 링크 플랩 및 서비스 순단이 발생할 확률이 큽니다. 유지보수 시간대 작업을 권장합니다.';
    } else if (score >= 30) {
      levelText = '주의 (MEDIUM)';
      levelColor = 'var(--risk-medium)';
      title = '일시적 수렴 지연 주의';
      desc = '단시간(1~30초) 패킷 유실 가능성이 존재하며, 명령어 문법 실수(VLAN Overwrite)에 각별히 유의해야 합니다.';
    }

    if (gaugeCircle) gaugeCircle.style.stroke = levelColor;
    if (riskBadge) {
      riskBadge.textContent = levelText;
      riskBadge.style.color = levelColor;
      riskBadge.style.background = `rgba(${hexToRgb(levelColor)}, 0.15)`;
      riskBadge.style.border = `1px solid ${levelColor}`;
    }
    if (riskSummaryTitle) riskSummaryTitle.textContent = title;
    if (riskSummaryDesc) riskSummaryDesc.textContent = desc;

    // 2. Secondary Metrics
    if (loopProbEl) loopProbEl.textContent = `${loopProbability}%`;
    if (loopProbDetail) loopProbDetail.textContent = loopProbability > 35 ? '매우 위험: 브로드캐스트 스톰 유발 가능' : (loopProbability > 15 ? '주의: 임시 루프 형성 가능성 있음' : '정상: STP 안정 동작 예측');

    if (flapDurationEl) flapDurationEl.textContent = flapSeconds === 999 ? '지속 장애' : `${flapSeconds}초`;
    if (flapDurationDetail) flapDurationDetail.textContent = flapSeconds > 15 ? 'STP Listening/Learning 수렴 대기' : (flapSeconds > 0 ? 'Rapid STP Proposal/Agreement 빠른 동기화' : '즉각 반영 (무중단 예상)');

    if (tcnImpactEl) tcnImpactEl.textContent = tcnScope;
    if (tcnImpactDetail) tcnImpactDetail.textContent = data.isRootInvolved ? 'Root 스위치 연결 구간으로 전사 스위치에 즉시 전파' : '작업 인터페이스 및 인접 장비에 국한';

    // 3. Scenario List
    if (scenarioList) {
      scenarioList.innerHTML = '';
      if (scenarios.length === 0) {
        const li = document.createElement('li');
        li.className = 'scenario-item severity-low';
        li.innerHTML = '<strong>특이 장애 위험 없음:</strong> 감지된 치명적인 설정 불일치나 위험 패턴이 없습니다.';
        scenarioList.appendChild(li);
      } else {
        scenarios.forEach(sc => {
          const li = document.createElement('li');
          li.className = `scenario-item severity-${sc.level}`;
          li.innerHTML = sc.text;
          scenarioList.appendChild(li);
        });
      }
    }

    // 4. Safety Checklist
    renderChecklist(data);

    // 5. CLI Snippet Generation
    renderCli(data);
  }

  function hexToRgb(colorVar) {
    if (colorVar.includes('--risk-critical')) return '239, 68, 68';
    if (colorVar.includes('--risk-high')) return '249, 115, 22';
    if (colorVar.includes('--risk-medium')) return '245, 158, 11';
    return '16, 185, 129';
  }

  function renderChecklist(data) {
    if (!checklistItems) return;
    const list = [];
    const vlanStr = data.vlans.length > 0 ? data.vlans.join(',') : '100';

    if (data.isRootInvolved) {
      list.push({ ok: false, text: `<strong>[Root Bridge 직결 링크]</strong> 선택된 인터페이스는 Root Bridge와 연결되어 있습니다. 설정 변경 전 Root 장애 방지(Root Guard) 여부를 확인하십시오.` });
    }
    if (switchportAllowedAll && switchportAllowedAll.checked) {
      list.push({ ok: false, text: '<strong>[필수 점검]</strong> 명령어 입력 시 반드시 <code>switchport trunk allowed vlan <u>add</u> ' + vlanStr + '</code> 로 실행하십시오.' });
    }
    if (data.isBlkPort) {
      list.push({ ok: false, text: `<strong>[BLK 인터페이스 점검]</strong> 설정된 Cost(${data.currentCost}) 및 <code>show spanning-tree interface [인터페이스]</code> 로 대체 경로 상태를 먼저 확인하십시오.` });
      list.push({ ok: true, text: '<strong>[단방향 링크 방어]</strong> 광케이블 Rx/Tx 단선으로 인한 루프를 방지하려면 <code>udld aggressive</code> 또는 <code>spanning-tree loopguard default</code> 를 권장합니다.' });
    }
    if (portType && portType.value === 'access') {
      list.push({ ok: true, text: '<strong>[엑세스 포트 보안]</strong> 엔드포인트/서버 연결 포트라면 <code>spanning-tree bpduguard enable</code> 과 <code>spanning-tree portfast</code> 를 세트로 활성화하십시오.' });
    }
    if (portType && portType.value === 'trunk' && portfast && portfast.checked) {
      list.push({ ok: false, text: '<strong>[설정 제거 권고]</strong> 트렁크 포트에 설정된 <code>spanning-tree portfast trunk</code> 는 반대편 스위치 연결 시 치명적 루프를 유발하므로 해제하는 것이 안전합니다.' });
    }
    list.push({ ok: true, text: '<strong>[VLAN DB 확인]</strong> 트렁크에 VLAN을 할당하기 전, <code>show vlan brief</code> 로 스위치 로컬 DB에 해당 VLAN ID가 생성되어 있는지 확인하십시오.' });

    checklistItems.innerHTML = '';
    list.forEach(item => {
      const div = document.createElement('div');
      div.className = 'checklist-item';
      div.innerHTML = `<span class="${item.ok ? 'check-icon-ok' : 'check-icon-warn'}">${item.ok ? '✓' : '▲'}</span> <span>${item.text}</span>`;
      checklistItems.appendChild(div);
    });
  }

  function renderCli(data) {
    if (!cliSnippet) return;
    const vlanStr = data.vlans.length > 0 ? data.vlans.join(',') : '100';
    const link = data.targetLink;
    const swName = link.from;
    const ifaceName = link.fromPort || 'GigabitEthernet0/1';

    let code = `! ==========================================\n`;
    code += `! [${swName}] 인터페이스 ${ifaceName} (${link.name})\n`;
    code += `! STP State: ${link.state.toUpperCase()} | Cost: ${link.cost} | Port-Priority: ${link.portPriority || 128}\n`;
    code += `! ==========================================\n\n`;

    code += `! --- 작업 전 상태 점검 (Pre-Check) ---\n`;
    code += `show spanning-tree interface ${ifaceName}\n`;
    code += `show spanning-tree root\n`;
    code += `show interfaces ${ifaceName} trunk\n`;
    code += `show vlan id ${vlanStr}\n\n`;

    code += `! --- 인터페이스 설정 적용 (Configuration) ---\n`;
    code += `configure terminal\n`;
    code += `interface ${ifaceName}\n`;
    code += ` description LINK_TO_${link.to}\n`;
    code += ` spanning-tree cost ${link.cost}\n`;
    code += ` spanning-tree port-priority ${link.portPriority || 128}\n`;

    if (data.isTrunk) {
      code += ` switchport mode trunk\n`;
      code += ` ! ★ 주의: 반드시 'add' 키워드를 포함하여 기존 VLAN 보존\n`;
      code += ` switchport trunk allowed vlan add ${vlanStr}\n`;
      if (data.isBlkPort) {
        code += ` ! BLK 상태인 포트 단방향 장애 루프 방어\n`;
        code += ` spanning-tree guard loop\n`;
      }
    } else {
      code += ` switchport mode access\n`;
      code += ` switchport access vlan ${data.vlans[0] || '100'}\n`;
      code += ` spanning-tree portfast\n`;
      code += ` spanning-tree bpduguard enable\n`;
    }
    code += ` exit\n\n`;

    code += `! --- 작업 후 결과 검증 (Post-Check) ---\n`;
    code += `end\n`;
    code += `show spanning-tree interface ${ifaceName} detail\n`;
    code += `show mac address-table interface ${ifaceName}\n`;

    cliSnippet.textContent = code;
  }

  // Presets handler
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = e.target.dataset.preset;
      if (type === 'trunk-vlan') {
        if (workType) workType.value = 'vlan_add_trunk';
        if (portType) portType.value = 'trunk';
        if (stpMode) stpMode.value = 'rapid_pvst';
        if (redundantTopology) redundantTopology.value = 'triangle';
        if (switchportAllowedAll) switchportAllowedAll.checked = false;
        if (hasNativeVlanMismatch) hasNativeVlanMismatch.checked = false;
        if (portfast) portfast.checked = false;
        if (guardLoop) guardLoop.checked = true;
      } else if (type === 'blk-action') {
        if (workType) workType.value = 'blk_up';
        if (portType) portType.value = 'trunk';
        if (redundantTopology) redundantTopology.value = 'ring';
        if (stpMode) stpMode.value = 'pvst';
        if (switchportAllowedAll) switchportAllowedAll.checked = false;
        if (guardLoop) guardLoop.checked = false;
      } else if (type === 'high-risk') {
        if (workType) workType.value = 'blk_up';
        if (portType) portType.value = 'trunk';
        if (redundantTopology) redundantTopology.value = 'mesh';
        if (stpMode) stpMode.value = 'stp';
        if (switchportAllowedAll) switchportAllowedAll.checked = true;
        if (portfast) portfast.checked = true;
        if (hasNativeVlanMismatch) hasNativeVlanMismatch.checked = true;
        if (guardBpdu) guardBpdu.checked = false;
        if (guardRoot) guardRoot.checked = false;
        if (guardLoop) guardLoop.checked = false;
      }
      if (redundantTopology) {
        updateTopologyLayout(redundantTopology.value);
      }
      renderTopologyGUI();
      calculateRisk();
      showToast(`'${e.target.textContent}' 프리셋이 로드되었습니다.`);
    });
  });

  // Copy CLI Snippet
  const btnCopyCli = document.getElementById('btnCopyCli');
  if (btnCopyCli && cliSnippet) {
    btnCopyCli.addEventListener('click', () => {
      navigator.clipboard.writeText(cliSnippet.textContent).then(() => {
        showToast('안전 CLI 명령어가 클립보드에 복사되었습니다.');
      });
    });
  }

  // Export Report
  const btnExport = document.getElementById('btnExport');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const targetLink = topologyData.links.find(l => l.isTarget) || topologyData.links[0];
      const reportText = `[STP & VLAN 작업 위험도 평가 보고서]
- 작업 대상 인터페이스: ${targetLink.name} (STP: ${targetLink.state.toUpperCase()}, Cost: ${targetLink.cost}, Priority: ${targetLink.portPriority || 128})
- 종합 위험도 지수: ${riskScoreEl ? riskScoreEl.textContent : '0'} / 100 (${riskBadge ? riskBadge.textContent : ''})
- 루프 발생 확률: ${loopProbEl ? loopProbEl.textContent : '0%'}
- 서비스 지연/수렴 시간: ${flapDurationEl ? flapDurationEl.textContent : '0초'}
- TCN 영향 범위: ${tcnImpactEl ? tcnImpactEl.textContent : ''}
- 대상 VLAN: ${vlanInput ? vlanInput.value : ''}
- 토폴로지: ${redundantTopology ? redundantTopology.options[redundantTopology.selectedIndex].text : ''}
- STP 동작 모드: ${stpMode ? stpMode.options[stpMode.selectedIndex].text : ''}
- 진단 결과: ${riskSummaryTitle ? riskSummaryTitle.textContent : ''} - ${riskSummaryDesc ? riskSummaryDesc.textContent : ''}
`;
      navigator.clipboard.writeText(reportText).then(() => {
        showToast('위험도 평가 요약 보고서가 복사되었습니다.');
      });
    });
  }

  // Attach event listeners for real-time recalculation
  if (form) {
    form.addEventListener('input', calculateRisk);
    form.addEventListener('change', calculateRisk);
  }

  // Initialize Layout & Initial calculation
  updateTopologyLayout('triangle');
  renderTopologyGUI();
  calculateRisk();
});
