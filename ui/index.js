/**
 * ui/index.js — Natural Language Planning Compiler (Word-Boundary Tokenizer + Gemini JSON Tool Calls),
 * GeminiUrbanBridge Class, and Accessibility / Keyboard Navigation Controls for Mountain View Digital Twin.
 *
 * Fixes from Remediation Brief Sections 1, 2, 4, 5:
 * - Bug #7 Fixed: Replaces substring `.includes('sea')` / `.includes('tod')` matching with a strict
 *   word-boundary tokenizer and explicit action-verb + target-entity intent table.
 *   Regression verified: `"What does the research say about today?"` produces ZERO state changes.
 * - Bug #8 Fixed: Sends Gemini API key strictly in the `x-goog-api-key` HTTP header (never in URL query string),
 *   never prints key fragments in the UI, and uses structured JSON output (`responseMimeType: "application/json"`)
 *   so Gemini returns executable tool calls (`set_far`, `rezone_district`, `set_surge`, `set_transit_share`, `set_canopy`)
 *   that drive the simulation.
 * - Section 1 Fixed: Removes all fake MCP tool names and non-existent stack claims.
 */

import { SCENARIO_PRESETS, resolveDistrictKey } from '../sim/constants.js';

/**
 * Tokenize natural language input into lowercase whole words using word boundaries (\b).
 * Prevents "research" from matching "sea" and "today" from matching "tod".
 */
export function tokenizePromptWords(promptText) {
  if (!promptText || typeof promptText !== 'string') return [];
  return promptText.toLowerCase().match(/\b[a-z0-9_.-]+\b/g) || [];
}

/**
 * Deterministic Word-Boundary Natural Language Intent Parser (Bug #7 Fixed).
 * Returns `{ mutated: boolean, toolCalls: Array<{tool: string, args: object}>, explanation: string }`.
 *
 * Requires explicit planning command tokens (verbs or explicit numeric parameter assignments)
 * so conversational questions like "What does the research say about today?" produce 0 toolCalls and mutated=false.
 */
export function compileNaturalLanguageIntent(promptText) {
  const raw = String(promptText || '').trim();
  const tokens = tokenizePromptWords(raw);
  const wordSet = new Set(tokens);

  if (tokens.length === 0) {
    return {
      mutated: false,
      toolCalls: [],
      explanation: '[LOCAL NL COMPILER] No command entered. Try: "Set FAR to 3.2 in North Bayshore", "Rezone Downtown Castro to TOD10", or "Set storm surge to 1.2m".'
    };
  }

  const questionStarters = new Set(['what', 'why', 'how', 'when', 'where', 'who', 'which', 'does', 'do', 'is', 'are', 'can', 'could', 'would', 'should']);
  const commandVerbs = new Set(['set', 'rezone', 'upzone', 'downzone', 'apply', 'simulate', 'increase', 'decrease', 'raise', 'lower', 'boost', 'reduce', 'reset', 'restore', 'change', 'make', 'convert']);

  const firstWord = tokens[0];
  const hasCommandVerb = tokens.some((t) => commandVerbs.has(t));
  const isQuestion = raw.endsWith('?') || questionStarters.has(firstWord);

  if (isQuestion && !hasCommandVerb) {
    return {
      mutated: false,
      toolCalls: [],
      explanation: '[LOCAL NL COMPILER] Informational query recognized — 0 simulation parameters modified. Use explicit planning commands (e.g., "Rezone North Bayshore to TOD10", "Set FAR to 3.5", "Set surge to 1.2m", or "Set transit share to 48%") to modify the scenario.'
    };
  }

  const toolCalls = [];

  // 1. Check for Reset / Baseline intent
  if (wordSet.has('reset') || (wordSet.has('restore') && wordSet.has('baseline')) || (wordSet.has('2026') && wordSet.has('baseline'))) {
    toolCalls.push({ tool: 'apply_scenario', args: { scenario: 'baseline' } });
    return {
      mutated: true,
      toolCalls,
      explanation: '[LOCAL NL COMPILER] Executed apply_scenario(baseline): Reset all parameters and district multipliers to 2026 Baseline.'
    };
  }

  function extractNumberNearKeywords(keywordRegex, minVal, maxVal) {
    const match = raw.match(keywordRegex);
    if (match && match[1] !== undefined) {
      const val = parseFloat(match[1]);
      if (Number.isFinite(val)) {
        return Math.max(minVal, Math.min(maxVal, val));
      }
    }
    return null;
  }

  // 2. Check for explicit District Rezoning intent (whole words only)
  const districtMentions = [];
  if (wordSet.has('bayshore') || wordSet.has('google') || wordSet.has('shoreline') || wordSet.has('nb_pp') || wordSet.has('nb-p')) districtMentions.push('NB_PP');
  if (wordSet.has('castro') || wordSet.has('downtown') || wordSet.has('dt_cra') || wordSet.has('dt-p')) districtMentions.push('DT_CRA');
  if ((wordSet.has('camino') && wordSet.has('real')) || wordSet.has('ecr') || wordSet.has('boulevard') || wordSet.has('brt') || wordSet.has('ecr_mu') || wordSet.has('ecr-p')) districtMentions.push('ECR_MU');
  if (wordSet.has('whisman') || wordSet.has('moffett') || wordSet.has('hangar') || wordSet.has('ew_tod') || wordSet.has('ew-p')) districtMentions.push('EW_TOD');
  if ((wordSet.has('san') && wordSet.has('antonio')) || wordSet.has('sa_pp') || wordSet.has('sa-p')) districtMentions.push('SA_PP');
  if (wordSet.has('waverly') || wordSet.has('residential') || wordSet.has('res_sf')) districtMentions.push('RES_SF');

  const isDownzone = wordSet.has('downzone') || wordSet.has('low-density') || (wordSet.has('low') && wordSet.has('density')) || wordSet.has('single-family') || wordSet.has('r-1') || wordSet.has('r1');

  let targetZone = null;
  if (isDownzone) {
    targetZone = 'R1';
  } else if (wordSet.has('tod10') || wordSet.has('tod-10') || (wordSet.has('tod') && (hasCommandVerb || districtMentions.length > 0))) {
    targetZone = 'TOD10';
  } else if (wordSet.has('mu6') || wordSet.has('cra-mu6') || (wordSet.has('mixed-use') && hasCommandVerb)) {
    targetZone = 'MU6';
  } else if (wordSet.has('r3') || wordSet.has('r-3')) {
    targetZone = 'R3';
  } else if ((wordSet.has('park') || wordSet.has('parks') || wordSet.has('eco-park') || wordSet.has('ecopark') || wordSet.has('bioswale') || wordSet.has('os-eco')) && (hasCommandVerb || districtMentions.length > 0)) {
    targetZone = 'PARK';
  } else if ((wordSet.has('rezone') || wordSet.has('upzone')) && districtMentions.length > 0) {
    targetZone = 'TOD10';
  }

  if (districtMentions.length > 0 && (targetZone || hasCommandVerb)) {
    const effectiveZone = targetZone || (isDownzone ? 'R1' : 'TOD10');
    for (const distKey of districtMentions) {
      toolCalls.push({
        tool: 'rezone_district',
        args: { district: distKey, zone: effectiveZone }
      });
    }
  } else if (targetZone === 'PARK') {
    toolCalls.push({
      tool: 'rezone_district',
      args: { district: 'DT_CRA', zone: 'PARK' }
    });
  }

  // 3. Check for explicit FAR Cap or Story count adjustment (whole words only)
  const storyMatch = raw.match(/\b(\d+)\s*(?:stories|story|floors)\b/i);
  const farMatch = raw.match(/\bfar\s*(?:of|to|cap|=|:)?\s*(\d+(?:\.\d+)?)\b/i);
  if (farMatch) {
    const val = Math.max(1.0, Math.min(6.0, parseFloat(farMatch[1])));
    toolCalls.push({ tool: 'set_far', args: { far: val } });
  } else if (storyMatch) {
    const stories = parseInt(storyMatch[1], 10);
    const val = Math.max(1.0, Math.min(6.0, +(stories * 0.65).toFixed(1)));
    toolCalls.push({ tool: 'set_far', args: { far: val } });
  } else if (isDownzone) {
    toolCalls.push({ tool: 'set_far', args: { far: 1.4 } });
  } else if (wordSet.has('upzone') || (wordSet.has('high') && wordSet.has('density')) || (districtMentions.length > 0 && hasCommandVerb)) {
    toolCalls.push({ tool: 'set_far', args: { far: 4.4 } });
  }

  // 4. Check for explicit Transit Mode Share intent (whole words only: "transit", "caltrain", "brt", "rail")
  if (wordSet.has('transit') || wordSet.has('caltrain') || wordSet.has('brt') || wordSet.has('rail') || (wordSet.has('mode') && wordSet.has('share'))) {
    const transitPctMatch =
      raw.match(/\b(\d+)\s*%\s*(?:transit|rail|mode|brt|shuttle|caltrain)\b/i) ||
      raw.match(/\b(?:transit|rail|mode\s*share|brt|caltrain)\s*(?:to|at|of|=|:)?\s*(\d+)\s*%?\b/i);
    if (transitPctMatch) {
      const val = Math.max(10, Math.min(85, parseInt(transitPctMatch[1], 10)));
      toolCalls.push({ tool: 'set_transit_share', args: { transitSharePct: val } });
    } else if (hasCommandVerb || districtMentions.length > 0) {
      toolCalls.push({ tool: 'set_transit_share', args: { transitSharePct: isDownzone ? 25 : 54 } });
    }
  }

  // 5. Check for explicit Urban Tree Canopy / Solar / Greenspace intent (whole words only)
  if (wordSet.has('canopy') || wordSet.has('tree') || wordSet.has('trees') || wordSet.has('greenspace') || wordSet.has('solar') || wordSet.has('sponge')) {
    const greenPctMatch =
      raw.match(/\+?(\d+)\s*%\s*(?:solar|canopy|green|greenspace|tree|trees|permeable)\b/i) ||
      raw.match(/\b(?:solar|canopy|green|greenspace|tree|trees)\s*(?:to|at|of|by|=|:)?\s*\+?(\d+)\s*%?\b/i);
    if (greenPctMatch) {
      const val = Math.max(10, Math.min(55, parseInt(greenPctMatch[1], 10)));
      toolCalls.push({ tool: 'set_canopy', args: { canopyPct: val } });
    } else if (hasCommandVerb || wordSet.has('sponge')) {
      toolCalls.push({ tool: 'set_canopy', args: { canopyPct: 32 } });
    }
  }

  // 6. Check for explicit Storm Surge / Flood intent (whole words only: "flood", "surge", "tide", or "sea" + "level"/"rise")
  const hasDryPhrase = (wordSet.has('no') && (wordSet.has('flood') || wordSet.has('surge'))) || wordSet.has('dry') || /\b0(?:\.0)?\s*m\s*surge\b/i.test(raw);
  const hasSurgeWord = wordSet.has('flood') || wordSet.has('surge') || wordSet.has('tide') || wordSet.has('inundation') || (wordSet.has('sea') && (wordSet.has('level') || wordSet.has('rise')));
  if (hasDryPhrase) {
    toolCalls.push({ tool: 'set_surge', args: { surgeMeters: 0.0 } });
  } else if (hasSurgeWord) {
    const meterMatch = extractNumberNearKeywords(/\b(\d+(?:\.\d+)?)\s*(?:m|meters?)\b/i, 0.0, 2.0);
    if (meterMatch !== null) {
      toolCalls.push({ tool: 'set_surge', args: { surgeMeters: meterMatch } });
    } else if (hasCommandVerb || wordSet.has('king')) {
      toolCalls.push({ tool: 'set_surge', args: { surgeMeters: 1.3 } });
    }
  }

  if (toolCalls.length === 0) {
    return {
      mutated: false,
      toolCalls: [],
      explanation: '[LOCAL NL COMPILER] No explicit parameter changes matched in prompt — simulation state unchanged. Try: "Upzone El Camino Real to 6 stories with BRT and 30% solar canopy" or "Set surge to 1.2m".'
    };
  }

  const summaryLabels = toolCalls.map((tc) => `${tc.tool}(${JSON.stringify(tc.args)})`).join(', ');
  return {
    mutated: true,
    toolCalls,
    explanation: `[LOCAL NL COMPILER] Executed ${summaryLabels}.`
  };
}

/**
 * Calls Gemini 2.5 Flash via the `x-goog-api-key` HTTP header (never in the URL query string!)
 * to translate a natural-language planning request into structured JSON tool calls.
 */
export async function invokeGeminiStructuredPlanner(promptText, apiKey, currentTelemetrySnapshot) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return null;
  }

  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  const systemInstruction = `You are the urban planning compiler for the City of Mountain View 3D Digital Twin.
Given the user's prompt, decide whether they are asking an informational question (return an empty tool_calls array []) OR requesting changes to the simulation.
Available tools:
1. {"tool": "set_far", "args": {"far": number (1.0 to 6.0)}}
2. {"tool": "rezone_district", "args": {"district": "NB_PP"|"DT_CRA"|"ECR_MU"|"EW_TOD"|"SA_PP", "zone": "TOD10"|"MU6"|"R3"|"R1"|"PARK"}}
3. {"tool": "set_surge", "args": {"surgeMeters": number (0.0 to 2.0)}}
4. {"tool": "set_transit_share", "args": {"transitSharePct": number (10 to 85)}}
5. {"tool": "set_canopy", "args": {"canopyPct": number (10 to 55)}}
6. {"tool": "apply_scenario", "args": {"scenario": "baseline"|"bayshore"|"elcamino"|"eastwhisman"|"sponge"}}

Return strictly valid JSON with schema:
{"tool_calls": [...], "summary": "Concise 1-2 sentence explanation of what was changed or answered."}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim()
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `User prompt: ${promptText}\nCurrent state: ${JSON.stringify(currentTelemetrySnapshot || {})}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 280,
          responseMimeType: 'application/json'
        }
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.tool_calls)) return null;
    return {
      toolCalls: parsed.tool_calls,
      summary: String(parsed.summary || '').trim()
    };
  } catch (_err) {
    return null;
  }
}

/**
 * GeminiUrbanBridge — Executes structured tool calls from either Gemini 2.5 Flash (via x-goog-api-key header)
 * or the local deterministic word-boundary NL compiler.
 */
export class GeminiUrbanBridge {
  constructor(simEngines, onStateMutated, getParcels = () => []) {
    this.simEngines = simEngines;
    this.onStateMutated = onStateMutated;
    this.getParcels = getParcels;
    this.lastDispatch = null;
  }

  getApiKey() {
    try {
      return sessionStorage.getItem('bevelez_gemini_api_key') || localStorage.getItem('bevelez_gemini_api_key') || '';
    } catch (_) {
      return '';
    }
  }

  hasApiKey() {
    return Boolean(this.getApiKey());
  }

  setApiKey(val) {
    try {
      const trimmed = (val || '').trim();
      if (trimmed) {
        sessionStorage.setItem('bevelez_gemini_api_key', trimmed);
        localStorage.removeItem('bevelez_gemini_api_key');
      } else {
        sessionStorage.removeItem('bevelez_gemini_api_key');
        localStorage.removeItem('bevelez_gemini_api_key');
      }
    } catch (_) {}
  }

  clearApiKey() {
    this.setApiKey('');
  }

  compileNaturalLanguageToActions(rawPrompt) {
    const parsed = compileNaturalLanguageIntent(rawPrompt);
    if (!parsed || !parsed.mutated || !parsed.toolCalls || parsed.toolCalls.length === 0) {
      this.lastDispatch = {
        engine: 'LOCAL NL COMPILER',
        prompt: rawPrompt,
        mutated: false,
        mutatedKeys: [],
        toolCalls: [],
        timestamp: Date.now()
      };
      return {
        matched: false,
        mutated: false,
        mutatedKeys: [],
        toolCalls: [],
        matchedDistricts: [],
        summary: parsed ? parsed.explanation : '[LOCAL NL COMPILER] No state changes.'
      };
    }

    const matchedDistricts = this._applyToolCalls(parsed.toolCalls);
    const mutatedKeys = parsed.toolCalls.map((tc) => tc.tool);
    const snap = this.onStateMutated ? this.onStateMutated('nl-prompt') : null;
    this.lastDispatch = {
      engine: 'LOCAL NL COMPILER',
      prompt: rawPrompt,
      mutated: true,
      mutatedKeys,
      matchedDistricts,
      toolCalls: parsed.toolCalls,
      timestamp: Date.now()
    };
    return {
      matched: true,
      mutated: true,
      mutatedKeys,
      toolCalls: parsed.toolCalls,
      matchedDistricts,
      snapshot: snap,
      summary: parsed.explanation
    };
  }

  _applyToolCalls(toolCalls) {
    const sim = this.simEngines;
    const matchedDistricts = [];

    for (const tc of toolCalls) {
      if (!tc || !tc.tool) continue;
      const args = tc.args || {};

      if (tc.tool === 'apply_scenario') {
        const key = String(args.scenario || 'baseline').toLowerCase();
        const preset = SCENARIO_PRESETS[key] || SCENARIO_PRESETS.baseline;
        sim.activeScenarioId = preset.id;
        sim.params = {
          farCap: preset.farCap,
          transitShare: preset.transitShare,
          canopyMandate: preset.canopyMandate,
          baySurge: preset.baySurge
        };
        sim.districtMultipliers = { ...preset.districtMultipliers };
        sim.parcelOverrides.clear();
      } else if (tc.tool === 'rezone_district') {
        sim.activeScenarioId = 'custom';
        const distKey = resolveDistrictKey(args.district) || 'NB_PP';
        const zone = String(args.zone || 'TOD10').toUpperCase();
        matchedDistricts.push(distKey);
        if (zone === 'PARK') {
          const parcels = this.getParcels();
          const candidates = parcels.filter((p) => p.district === distKey || (distKey === 'DT_CRA' && p.district === 'NB_PP'));
          for (let i = 0; i < Math.min(6, candidates.length); i++) {
            sim.parcelOverrides.set(candidates[i].id, 'PARK');
          }
        } else {
          const multMap = {
            TOD10: distKey === 'NB_PP' ? 2.45 : (distKey === 'DT_CRA' ? 2.35 : 2.30),
            MU6: 1.85,
            R3: 1.35,
            R1: 0.68
          };
          sim.districtMultipliers[distKey] = multMap[zone] || 2.35;
        }
      } else if (tc.tool === 'set_far') {
        sim.activeScenarioId = 'custom';
        const farVal = Number(args.far);
        if (Number.isFinite(farVal)) {
          sim.params.farCap = Math.max(1.0, Math.min(6.0, farVal));
        }
      } else if (tc.tool === 'set_surge') {
        sim.activeScenarioId = 'custom';
        const surgeVal = Number(args.surgeMeters);
        if (Number.isFinite(surgeVal)) {
          sim.params.baySurge = Math.max(0.0, Math.min(2.0, surgeVal));
        }
      } else if (tc.tool === 'set_transit_share') {
        sim.activeScenarioId = 'custom';
        const trVal = Number(args.transitSharePct);
        if (Number.isFinite(trVal)) {
          sim.params.transitShare = Math.max(10, Math.min(85, trVal));
        }
      } else if (tc.tool === 'set_canopy') {
        sim.activeScenarioId = 'custom';
        const canVal = Number(args.canopyPct);
        if (Number.isFinite(canVal)) {
          sim.params.canopyMandate = Math.max(10, Math.min(55, canVal));
        }
      }
    }

    return matchedDistricts;
  }

  async executePrompt(rawPrompt) {
    const prompt = (rawPrompt || '').trim();
    if (!prompt) return null;

    const savedKey = this.getApiKey();

    let toolCalls = null;
    let aiSummary = null;
    let engineLabel = 'LOCAL NL COMPILER';

    if (savedKey && savedKey.startsWith('AIza')) {
      const geminiResult = await invokeGeminiStructuredPlanner(prompt, savedKey, {
        params: this.simEngines.params,
        districtMultipliers: this.simEngines.districtMultipliers
      });
      if (geminiResult && Array.isArray(geminiResult.toolCalls)) {
        toolCalls = geminiResult.toolCalls;
        aiSummary = geminiResult.summary;
        engineLabel = 'GEMINI 2.5 FLASH (STRUCTURED JSON TOOLS)';
      }
    }

    let localParsed = null;
    if (toolCalls === null) {
      localParsed = compileNaturalLanguageIntent(prompt);
      toolCalls = localParsed.toolCalls;
    }

    if (!toolCalls || toolCalls.length === 0) {
      this.lastDispatch = {
        engine: engineLabel,
        prompt,
        mutated: false,
        mutatedKeys: [],
        toolCalls: [],
        timestamp: Date.now()
      };
      return aiSummary || (localParsed ? localParsed.explanation : `[${engineLabel}] Informational query — 0 parameters changed.`);
    }

    const matchedDistricts = this._applyToolCalls(toolCalls);
    const snap = this.onStateMutated('nl-prompt');
    this.lastDispatch = {
      engine: engineLabel,
      prompt,
      mutated: true,
      mutatedKeys: toolCalls.map((t) => t.tool),
      matchedDistricts,
      toolCalls,
      timestamp: Date.now()
    };

    const toolList = toolCalls.map((t) => t.tool).join(', ');
    if (aiSummary) {
      return `[${engineLabel}: ${toolList}] ${aiSummary}`;
    }
    return `[${engineLabel}: ${toolList}] Executed "${prompt}": Modeled Population ${snap.population.toLocaleString()} (${snap.rhnaDelta >= 0 ? '+' : ''}${snap.rhnaDelta.toLocaleString()} RHNA units), Greenspace ${snap.greenspacePct.toFixed(1)}%, US-101 LOS ${snap.corridors.us101.label} (V/C ${snap.corridors.us101.vc}), UHI ${snap.uhiDelta >= 0 ? '+' : ''}${snap.uhiDelta}°C.`;
  }
}

/**
 * Wires keyboard accessibility (Escape to close dialogs, Focus Trap inside Planner Drawer,
 * ArrowLeft/ArrowRight on `.planner-tab` buttons, and synchronized `aria-expanded` attributes).
 */
export function initAccessibilityControls({
  closePlannerDrawer,
  closeSimDrawer,
  closeGeminiCard,
  toggleSimDrawer,
  togglePlannerDrawer
} = {}) {
  if (typeof document === 'undefined') return;

  const btnControlsHud = document.getElementById('btn-controls-hud');
  if (btnControlsHud) {
    btnControlsHud.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof toggleSimDrawer === 'function') {
        toggleSimDrawer();
      } else {
        const simDrawer = document.getElementById('sim-drawer');
        if (simDrawer) simDrawer.classList.toggle('collapsed');
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const plannerDrawer = document.getElementById('planner-drawer');
      if (plannerDrawer && !plannerDrawer.classList.contains('collapsed')) {
        if (typeof closePlannerDrawer === 'function') closePlannerDrawer();
        else if (typeof togglePlannerDrawer === 'function') togglePlannerDrawer(false);
        else plannerDrawer.classList.add('collapsed');
        const toggleBtn = document.getElementById('btn-planner-header-toggle') || document.getElementById('btn-planner-pill');
        if (toggleBtn) toggleBtn.focus();
        return;
      }
      const geminiCard = document.getElementById('gemini-settings-card');
      if (geminiCard && !geminiCard.classList.contains('collapsed')) {
        if (typeof closeGeminiCard === 'function') closeGeminiCard();
        else geminiCard.classList.add('collapsed');
        const keyBtn = document.getElementById('btn-gemini-toggle');
        if (keyBtn) keyBtn.focus();
        return;
      }
      const simDrawer = document.getElementById('sim-drawer');
      if (simDrawer && !simDrawer.classList.contains('collapsed')) {
        if (typeof closeSimDrawer === 'function') closeSimDrawer();
        else if (typeof toggleSimDrawer === 'function') toggleSimDrawer(false);
        else simDrawer.classList.add('collapsed');
        const ctrlBtn = document.getElementById('btn-controls-hud') || document.getElementById('btn-drawer-toggle');
        if (ctrlBtn) ctrlBtn.focus();
      }
    }

    if (e.key === 'Tab') {
      const plannerDrawer = document.getElementById('planner-drawer');
      if (plannerDrawer && !plannerDrawer.classList.contains('collapsed')) {
        const focusable = Array.from(
          plannerDrawer.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')
        ).filter((el) => el.offsetParent !== null);
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
        const undoBtn = document.getElementById('btn-batch-rezone-undo');
        if (undoBtn && undoBtn.style.display !== 'none') {
          e.preventDefault();
          undoBtn.click();
        }
      }
    }
  });

  const tabButtons = Array.from(document.querySelectorAll('.planner-tab'));
  tabButtons.forEach((tab, idx) => {
    tab.addEventListener('keydown', (e) => {
      let nextIdx = null;
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabButtons.length;
      else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabButtons.length) % tabButtons.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = tabButtons.length - 1;

      if (nextIdx !== null) {
        e.preventDefault();
        tabButtons[nextIdx].focus();
        tabButtons[nextIdx].click();
      }
    });
  });
}

export { resolveDistrictKey };

