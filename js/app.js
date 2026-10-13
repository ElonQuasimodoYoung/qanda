(function () {
  const BANDS = {
    high: { label: "高频", note: "至少 6 份材料提到，优先和伴侣对过" },
    mid: { label: "中频", note: "3 到 5 份材料提到" },
    low: { label: "低频", note: "1 到 2 份材料提到，仍可能被问到" },
  };
  const TOPIC_ORDER = ["开场确认", "认识与时间线", "同住与日常", "联系与相处", "财务", "对方与家庭", "婚姻", "未来", "其他"];
  const STORAGE_KEY = "visa-prep-draft-v1";
  const SYNC_KEY = "visa-prep-sync-v1";
  const PROFILE_FIELDS = { _who: "who", _partner: "partner" };
  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const config = window.SYNC_CONFIG || {};
  const syncEnabled = Boolean(config.url && config.key);

  const questions = (window.QUESTIONS || []).map(function (q) {
    return Object.assign({}, q, {
      band: q.count >= 6 ? "high" : q.count >= 3 ? "mid" : "low",
    });
  });

  const list = document.getElementById("list");
  let filter = "all";
  let query = "";
  let sync = null;
  let pushTimer = null;
  let pushing = false;
  let live = null;
  let liveRetry = 0;
  let liveRef = 0;

  function emptyDraft() {
    return { answers: {}, profile: { who: "", partner: "" }, dirty: {} };
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (!data || typeof data !== "object") return emptyDraft();
      return {
        answers: data.answers && typeof data.answers === "object" ? data.answers : {},
        profile: {
          who: data.profile && data.profile.who ? String(data.profile.who) : "",
          partner: data.profile && data.profile.partner ? String(data.profile.partner) : "",
        },
        dirty: data.dirty && typeof data.dirty === "object" ? data.dirty : {},
      };
    } catch (err) {
      return emptyDraft();
    }
  }

  function answers() {
    return loadDraft().answers;
  }

  function profile() {
    return loadDraft().profile;
  }

  function persist(draft) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      answers: draft.answers,
      profile: draft.profile,
      dirty: draft.dirty,
      savedAt: new Date().toISOString(),
    }));
  }

  function readEntry(draft, key) {
    if (PROFILE_FIELDS[key]) return String(draft.profile[PROFILE_FIELDS[key]] || "");
    return String(draft.answers[key] || "");
  }

  function writeEntry(draft, key, value) {
    if (PROFILE_FIELDS[key]) draft.profile[PROFILE_FIELDS[key]] = value;
    else draft.answers[key] = value;
  }

  function entryKeys(draft) {
    return Object.keys(draft.answers).concat(Object.keys(PROFILE_FIELDS));
  }

  function setEntries(values) {
    const draft = loadDraft();
    Object.keys(values).forEach(function (key) {
      writeEntry(draft, key, values[key]);
      if (sync) draft.dirty[key] = true;
    });
    persist(draft);
    if (sync) schedulePush();
    else setStatus("已保存在这台浏览器");
  }

  function setStatus(text) {
    document.getElementById("dock-status").textContent = text;
  }

  function grouped(items) {
    return ["high", "mid", "low"].map(function (band) {
      const inBand = items.filter(function (q) { return q.band === band; });
      const topics = [];
      TOPIC_ORDER.forEach(function (topic) {
        const found = inBand.filter(function (q) { return q.topic === topic; });
        if (found.length) topics.push({ topic: topic, items: found });
      });
      return { band: band, topics: topics, total: inBand.length };
    }).filter(function (group) { return group.total; });
  }

  function visibleQuestions() {
    const q = query.trim().toLowerCase();
    const store = answers();
    return questions.filter(function (item) {
      if (filter === "blank" && String(store[item.id] || "").trim()) return false;
      if (filter !== "all" && filter !== "blank" && item.band !== filter) return false;
      if (!q) return true;
      return (item.text + " " + (item.en || "") + " " + item.topic).toLowerCase().indexOf(q) !== -1;
    });
  }

  function render() {
    const store = answers();
    const groups = grouped(visibleQuestions());
    list.innerHTML = groups.map(function (group) {
      const meta = BANDS[group.band];
      const topics = group.topics.map(function (block) {
        const cards = block.items.map(function (item) {
          const value = store[item.id] || "";
          return (
            '<article class="card ' + item.band + '">' +
              '<div class="q-top"><h3 class="q-title">' + escapeHtml(item.text) + '</h3>' +
              '<span class="badge">出现 ' + item.count + ' 次</span></div>' +
              (item.en ? '<p class="en">' + escapeHtml(item.en) + '</p>' : '') +
              '<p class="hint">' + escapeHtml(item.hint || "") + '</p>' +
              '<label for="a-' + item.id + '">你的答案</label>' +
              '<textarea id="a-' + item.id + '" data-answer="' + item.id + '" placeholder="用自己的话写。日期、地址和金额尽量与申请材料一致。">' + escapeHtml(value) + '</textarea>' +
              '<p class="saved">' + (String(value).trim() ? "已保存" : "") + '</p>' +
            '</article>'
          );
        }).join("");
        return '<h3 class="topic">' + escapeHtml(block.topic) + '</h3>' + cards;
      }).join("");
      return '<section class="band"><div class="band-head"><h2>' + meta.label + '</h2><p>' + group.total + ' 题 · ' + meta.note + '</p></div>' + topics + '</section>';
    }).join("");
    document.getElementById("empty").hidden = groups.length !== 0;
    const counts = { high: 0, mid: 0, low: 0 };
    questions.forEach(function (item) { counts[item.band] += 1; });
    document.getElementById("count-high").textContent = counts.high;
    document.getElementById("count-mid").textContent = counts.mid;
    document.getElementById("count-low").textContent = counts.low;
    updateProgress();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateProgress() {
    const store = answers();
    const filled = questions.filter(function (item) { return String(store[item.id] || "").trim(); }).length;
    document.getElementById("done-count").textContent = filled + " / " + questions.length;
    document.getElementById("done-bar").style.width = (questions.length ? (filled / questions.length) * 100 : 0) + "%";
  }

  function markSaved(box, value) {
    const slot = box.parentElement.querySelector(".saved");
    if (slot) slot.textContent = value.trim() ? "已保存" : "";
  }

  function saveAnswer(id, value) {
    const values = {};
    values[id] = value;
    setEntries(values);
    const box = list.querySelector('[data-answer="' + id + '"]');
    if (box) markSaved(box, value);
    updateProgress();
  }

  function saveProfile(key) {
    const values = {};
    values[key] = document.getElementById(PROFILE_FIELDS[key]).value.trim();
    setEntries(values);
  }

  function buildPrint() {
    const store = answers();
    const info = profile();
    const filled = questions.filter(function (item) { return String(store[item.id] || "").trim(); }).length;
    const when = new Date();
    const stamp = when.getFullYear() + "-" + String(when.getMonth() + 1).padStart(2, "0") + "-" + String(when.getDate()).padStart(2, "0");
    const head = grouped(questions).map(function (group) {
      const blocks = group.topics.map(function (block) {
        return block.items.map(function (item) {
          const answer = String(store[item.id] || "").trim();
          return (
            '<section class="print-q"><strong>' + escapeHtml(item.text) + '</strong>' +
            '<div class="meta">' + BANDS[item.band].label + ' · 出现 ' + item.count + ' 次 · ' + escapeHtml(item.topic) +
            (item.en ? ' · ' + escapeHtml(item.en) : '') + '</div>' +
            '<p>' + escapeHtml(answer || "（未填写）") + '</p></section>'
          );
        }).join("");
      }).join("");
      return '<h2 class="print-band">' + BANDS[group.band].label + '</h2>' + blocks;
    }).join("");
    document.getElementById("print-sheet").innerHTML =
      '<h1>问答备忘</h1>' +
      '<p class="print-meta">填写人：' + escapeHtml(info.who || "未填写") +
      '　伴侣：' + escapeHtml(info.partner || "未填写") +
      '<br>导出日期：' + stamp +
      '　已填写 ' + filled + ' / ' + questions.length +
      '　频率按 13 份材料统计</p>' + head;
  }

  function exportPdf() {
    buildPrint();
    setStatus("在打印窗口中选择「存储为 PDF」");
    const previous = document.title;
    const info = profile();
    document.title = "问答备忘-" + (info.who || "未署名");
    window.print();
    document.title = previous;
  }

  function downloadBackup() {
    const draft = loadDraft();
    const blob = new Blob([JSON.stringify({ answers: draft.answers, profile: draft.profile }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "问答备忘-" + (draft.profile.who || "备份") + ".json";
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1500);
    setStatus("备份文件已下载");
  }

  function restoreBackup(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(String(reader.result || ""));
        if (!data || typeof data.answers !== "object") throw new Error("bad file");
        const current = loadDraft();
        const values = {};
        entryKeys(current).forEach(function (key) {
          if (readEntry(current, key)) values[key] = "";
        });
        Object.keys(data.answers).forEach(function (key) {
          values[key] = String(data.answers[key] || "");
        });
        values._who = data.profile && data.profile.who ? String(data.profile.who).slice(0, 40) : "";
        values._partner = data.profile && data.profile.partner ? String(data.profile.partner).slice(0, 40) : "";
        setEntries(values);
        fillProfile();
        render();
        if (!sync) setStatus("已从备份恢复");
      } catch (err) {
        setStatus("这个文件不是备忘备份");
      }
    };
    reader.readAsText(file);
  }

  function fillProfile() {
    const saved = profile();
    document.getElementById("who").value = saved.who;
    document.getElementById("partner").value = saved.partner;
  }

  function newCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return Array.from(bytes, function (b) { return CODE_ALPHABET[b & 31]; }).join("");
  }

  function normalizeCode(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function formatCode(code) {
    return code.match(/.{1,4}/g).join("-");
  }

  function loadSync() {
    try {
      const data = JSON.parse(localStorage.getItem(SYNC_KEY) || "null");
      if (data && normalizeCode(data.code).length >= 20) return { code: normalizeCode(data.code), merged: Boolean(data.merged) };
    } catch (err) {}
    return null;
  }

  function saveSync() {
    localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
  }

  function inviteLink() {
    return location.origin + location.pathname + "#sync=" + formatCode(sync.code);
  }

  function rpc(name, body) {
    const headers = { "Content-Type": "application/json", apikey: config.key };
    if (config.key.indexOf("eyJ") === 0) headers.Authorization = "Bearer " + config.key;
    return fetch(config.url.replace(/\/+$/, "") + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) throw new Error("sync " + res.status);
      return res.json();
    });
  }

  function syncFailed() {
    setStatus(navigator.onLine ? "同步失败，答案先存在本机，稍后自动重试" : "离线中，答案先存在本机");
  }

  function schedulePush() {
    setStatus("正在同步…");
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 400);
  }

  function push() {
    if (!sync || pushing) return Promise.resolve();
    const draft = loadDraft();
    const keys = Object.keys(draft.dirty);
    if (!keys.length) {
      setStatus("已同步");
      return Promise.resolve();
    }
    const items = {};
    keys.forEach(function (key) { items[key] = readEntry(draft, key); });
    pushing = true;
    return rpc("save_notes", { p_code: sync.code, p_items: items }).then(function () {
      pushing = false;
      const latest = loadDraft();
      keys.forEach(function (key) {
        if (readEntry(latest, key) === items[key]) delete latest.dirty[key];
      });
      persist(latest);
      announce();
      if (Object.keys(latest.dirty).length) return push();
      setStatus("已同步");
    }, function () {
      pushing = false;
      syncFailed();
    });
  }

  function pull() {
    if (!sync) return Promise.resolve();
    const code = sync.code;
    return rpc("get_notes", { p_code: code }).then(function (rows) {
      if (!sync || sync.code !== code) return;
      const draft = loadDraft();
      const remote = {};
      (rows || []).forEach(function (row) { remote[row.key] = String(row.value || ""); });
      if (!sync.merged) {
        entryKeys(draft).forEach(function (key) {
          if (readEntry(draft, key).trim() && !String(remote[key] || "").trim()) draft.dirty[key] = true;
        });
      }
      const changed = [];
      Object.keys(remote).forEach(function (key) {
        if (draft.dirty[key] || readEntry(draft, key) === remote[key]) return;
        writeEntry(draft, key, remote[key]);
        changed.push(key);
      });
      persist(draft);
      if (!sync.merged) {
        sync.merged = true;
        saveSync();
      }
      showRemote(changed);
      if (Object.keys(draft.dirty).length) return push();
      setStatus("已同步");
    }, syncFailed);
  }

  function liveTopic(code) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(code + ":live")).then(function (buf) {
      const hex = Array.from(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
      return "realtime:notes-" + hex.slice(0, 40);
    });
  }

  function sendLive(conn, topic, event, payload) {
    if (conn.ws.readyState !== WebSocket.OPEN) return;
    liveRef += 1;
    conn.ws.send(JSON.stringify({ topic: topic, event: event, payload: payload, ref: String(liveRef) }));
  }

  function closeLive() {
    if (!live) return;
    const conn = live;
    live = null;
    clearInterval(conn.heartbeat);
    conn.ws.close();
  }

  function connectLive() {
    if (!sync || !window.WebSocket || !window.crypto || !crypto.subtle) return;
    const code = sync.code;
    closeLive();
    liveTopic(code).then(function (topic) {
      if (!sync || sync.code !== code) return;
      closeLive();
      const url = config.url.replace(/^http/, "ws").replace(/\/+$/, "") +
        "/realtime/v1/websocket?apikey=" + encodeURIComponent(config.key) + "&vsn=1.0.0";
      const conn = { ws: new WebSocket(url), topic: topic, joined: false, heartbeat: null };
      live = conn;
      conn.ws.onopen = function () {
        sendLive(conn, topic, "phx_join", { config: { broadcast: { self: false }, presence: { key: "" }, postgres_changes: [] } });
        conn.heartbeat = setInterval(function () { sendLive(conn, "phoenix", "heartbeat", {}); }, 25000);
      };
      conn.ws.onmessage = function (event) {
        const msg = JSON.parse(event.data);
        if (msg.topic !== topic) return;
        if (msg.event === "phx_reply" && !conn.joined && msg.payload && msg.payload.status === "ok") {
          conn.joined = true;
          liveRetry = 0;
          pull();
        } else if (msg.event === "broadcast") {
          pull();
        }
      };
      conn.ws.onclose = function () {
        clearInterval(conn.heartbeat);
        if (live !== conn) return;
        live = null;
        const wait = Math.min(30000, 1000 * Math.pow(2, liveRetry));
        liveRetry += 1;
        setTimeout(function () { if (!live) connectLive(); }, wait);
      };
    });
  }

  function announce() {
    if (live && live.joined) sendLive(live, live.topic, "broadcast", { type: "broadcast", event: "changed", payload: {} });
  }

  function showRemote(keys) {
    if (!keys.length) return;
    const draft = loadDraft();
    keys.forEach(function (key) {
      const value = readEntry(draft, key);
      if (PROFILE_FIELDS[key]) {
        document.getElementById(PROFILE_FIELDS[key]).value = value;
        return;
      }
      const box = list.querySelector('[data-answer="' + CSS.escape(key) + '"]');
      if (!box) return;
      box.value = value;
      markSaved(box, value);
    });
    updateProgress();
  }

  function showSync() {
    document.getElementById("sync").hidden = false;
    document.getElementById("sync-code").textContent = formatCode(sync.code);
  }

  function extractCode(raw) {
    const text = String(raw || "");
    const match = text.match(/sync=([A-Za-z0-9-]+)/);
    return normalizeCode(match ? match[1] : text);
  }

  function joinCode(raw) {
    const code = extractCode(raw);
    if (code.length !== 24) {
      setStatus("同步码不对：粘贴完整的邀请链接，或输入 24 位同步码");
      return;
    }
    if (code === sync.code) {
      setStatus("已经在用这个同步码");
      return;
    }
    const draft = loadDraft();
    const hasLocal = entryKeys(draft).some(function (key) { return readEntry(draft, key).trim(); });
    if (hasLocal && !confirm("加入后，这台设备上的答案会合并进这个同步码。同一题两边都写了的，以同步码里的为准。继续吗？")) return;
    draft.dirty = {};
    persist(draft);
    sync = { code: code, merged: false };
    saveSync();
    showSync();
    setStatus("正在加入…");
    pull().then(function () {
      if (document.getElementById("dock-status").textContent === "已同步") {
        setStatus("已加入，之后双方的修改会自动同步");
      }
    });
    connectLive();
  }

  function joinFromLink() {
    if (!/sync=/.test(location.hash)) return;
    const raw = location.hash;
    history.replaceState(null, "", location.pathname + location.search);
    if (extractCode(raw) !== sync.code) joinCode(raw);
  }

  function copyInvite() {
    const link = inviteLink();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () {
        setStatus("邀请链接已复制，发给伴侣或另一台设备打开");
      }, function () {
        prompt("复制这个链接：", link);
      });
    } else {
      prompt("复制这个链接：", link);
    }
  }

  function startSync() {
    sync = loadSync();
    if (!sync) {
      sync = { code: newCode(), merged: false };
      saveSync();
    }
    showSync();
    document.getElementById("intro").textContent =
      "题目按 13 份材料里的出现次数分成高频、中频和低频。答案会存在这台浏览器，并同步到云端；用同一个同步码的手机、电脑和伴侣都能看到同一份。";
    setStatus("正在同步…");
    pull();
    connectLive();
    joinFromLink();
    window.addEventListener("hashchange", joinFromLink);

    document.getElementById("sync-copy").addEventListener("click", copyInvite);
    document.getElementById("sync-join").addEventListener("submit", function (event) {
      event.preventDefault();
      const input = document.getElementById("sync-input");
      joinCode(input.value);
      input.value = "";
    });
    setInterval(function () {
      if (document.visibilityState === "visible") pull();
    }, 20000);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      pull();
      if (!live) connectLive();
    });
    window.addEventListener("online", function () {
      push().then(pull);
      if (!live) connectLive();
    });
  }

  document.getElementById("filters").addEventListener("click", function (event) {
    const button = event.target.closest("button");
    if (!button) return;
    filter = button.dataset.filter;
    Array.from(document.getElementById("filters").children).forEach(function (chip) {
      chip.setAttribute("aria-pressed", chip === button ? "true" : "false");
    });
    render();
  });
  document.getElementById("search").addEventListener("input", function (event) {
    query = event.target.value;
    render();
  });
  list.addEventListener("input", function (event) {
    const box = event.target;
    if (!box.dataset.answer) return;
    saveAnswer(box.dataset.answer, box.value);
  });
  list.addEventListener("focusin", function (event) {
    const box = event.target;
    if (!box.dataset || !box.dataset.answer) return;
    window.setTimeout(function () {
      const dock = document.querySelector(".dock");
      const dockHeight = dock ? dock.getBoundingClientRect().height + 28 : 140;
      const rect = box.getBoundingClientRect();
      const visibleBottom = window.innerHeight - dockHeight;
      if (rect.bottom > visibleBottom || rect.top < 64) {
        box.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }, 280);
  });
  list.addEventListener("focusout", function (event) {
    if (filter === "blank" && event.target.dataset && event.target.dataset.answer) render();
  });
  document.getElementById("who").addEventListener("input", function () { saveProfile("_who"); });
  document.getElementById("partner").addEventListener("input", function () { saveProfile("_partner"); });
  document.getElementById("export").addEventListener("click", exportPdf);
  document.getElementById("backup").addEventListener("click", downloadBackup);
  document.getElementById("restore").addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (file) restoreBackup(file);
    event.target.value = "";
  });
  window.addEventListener("beforeprint", buildPrint);
  document.getElementById("clear").addEventListener("click", function () {
    const message = sync
      ? "清空全部答案？用同一个同步码的设备也会一起清空。"
      : "清空这台浏览器里保存的全部答案？";
    if (!confirm(message)) return;
    if (sync) {
      const draft = loadDraft();
      const values = {};
      entryKeys(draft).forEach(function (key) {
        if (readEntry(draft, key)) values[key] = "";
      });
      setEntries(values);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      setStatus("已清空");
    }
    fillProfile();
    render();
  });

  const hadDraft = Boolean(localStorage.getItem(STORAGE_KEY));
  fillProfile();
  render();
  if (syncEnabled) startSync();
  else if (hadDraft) setStatus("已恢复上次填写的内容");
})();
