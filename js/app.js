(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const input = $("#json-input"), treeRoot = $("#tree-root"), treeEmpty = $("#tree-empty");
  const editorWrap = $(".editor-wrap");
  const inputState = $("#input-state"), lineNumbers = $("#line-numbers"), searchInput = $("#search-input");
  const toast = $("#toast"), themeToggle = $("#theme-toggle");
  const timestampInput = $("#timestamp-input"), dateInput = $("#date-input");
  const jsonViewTab = $("#json-view-tab"), apiViewTab = $("#api-view-tab");
  const jsonViewPanel = $("#json-view-panel"), apiViewPanel = $("#api-view-panel");
  const explorerPanel = $("#explorer-panel"), apiExplorerSlot = $("#api-explorer-slot");
  const apiForm = $("#api-form"), apiMethod = $("#api-method"), apiUrl = $("#api-url");
  const apiHeaders = $("#api-headers"), apiBody = $("#api-body");
  const apiSend = $("#api-send"), apiCancel = $("#api-cancel");
  const MAX_API_RESPONSE_BYTES = 5 * 1024 * 1024;
  const API_REQUEST_TIMEOUT_MS = 30_000;
  let parsedData, formattedText = "", toastTimer;
  let dragDepth = 0;
  let apiController = null, apiTimedOut = false;
  let apiHasJsonResponse = false;

  const sample = {
    project: { name: "JSON Viewer", version: "1.0.0", description: "A lightweight browser-based JSON explorer", private: true },
    features: ["Validation", "Formatting", "Tree navigation", "Search"],
    metrics: { users: 1284, uptime: 99.95, beta: false, lastUpdated: null }
  };

  function notify(message) {
    toast.textContent = message; toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function updateLines() {
    const n = Math.max(1, input.value.split("\n").length);
    lineNumbers.textContent = Array.from({length:n}, (_,i)=>i+1).join("\n");
    lineNumbers.scrollTop = input.scrollTop;
    $("#input-meta").textContent = `${n} ${n===1?"line":"lines"} · ${input.value.length} characters`;
  }
  function setState(kind, message) {
    inputState.className = `state-pill ${kind}`;
    inputState.innerHTML = `<i></i>${escapeHtml(message)}`;
  }
  function status(message, error=false) {
    $("#status-message").innerHTML = `<i style="color:${error?"var(--red)":"var(--green)"}">●</i>${escapeHtml(message)}`;
  }
  function setTheme(theme) {
    const isLight = theme === "light";
    const selectedTheme = isLight ? "light" : "dark";
    document.documentElement.dataset.theme = selectedTheme;
    themeToggle.textContent = isLight ? "☾" : "☼";
    themeToggle.setAttribute("aria-label", `Switch to ${isLight ? "dark" : "light"} mode`);
    themeToggle.setAttribute("aria-pressed", String(isLight));
    themeToggle.title = `Switch to ${isLight ? "dark" : "light"} mode`;
    $('meta[name="theme-color"]').content = isLight ? "#f3f5fa" : "#0b1020";
    try { localStorage.setItem("json-viewer-theme", selectedTheme); } catch {
      // Theme persistence is optional when browser storage is unavailable.
    }
  }
  function loadTheme() {
    try {
      const savedTheme = localStorage.getItem("json-viewer-theme");
      if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    } catch {
      // Fall back to the default theme when browser storage is unavailable.
    }
  }
  function typeOf(v) { return v===null?"null":Array.isArray(v)?"array":typeof v; }

  function updateTreeControls() {
    const enabled = treeRoot.querySelector(".tree-children .tree-children > .tree-node") !== null;
    $("#expand-btn").disabled = !enabled;
    $("#collapse-btn").disabled = !enabled;
  }

  function makeNode(value, key, root=false) {
    const type = typeOf(value), container = type==="object" || type==="array";
    const node = document.createElement("div"); node.className = "tree-node";
    const row = document.createElement("div"); row.className = "tree-row"; row.setAttribute("role","treeitem");
    const toggle = document.createElement("button"); toggle.type="button";
    toggle.className = `tree-toggle ${container?"":"leaf"}`; toggle.textContent=container?"▼":"·";
    toggle.setAttribute("aria-label",container?"Collapse node":"Value"); row.append(toggle);
    if (!root) {
      const k=document.createElement("span"); k.className="tree-key"; k.textContent=typeof key==="number"?`[${key}]`:`"${key}"`;
      const colon=document.createElement("span"); colon.className="tree-colon"; colon.textContent=":";
      row.append(k,colon);
    }
    const val=document.createElement("span");
    val.className=container?"type-bracket":`type-${type}`;
    if (container) {
      const count=Object.keys(value).length; val.textContent=type==="array"?`[${count}]`:`{${count}}`;
      const meta=document.createElement("span"); meta.className="node-meta";
      meta.textContent=`${count} ${type==="array"?(count===1?"item":"items"):(count===1?"key":"keys")}`;
      row.append(val,meta);
    } else { val.textContent=type==="string"?`"${value}"`:String(value); row.append(val); }
    node.append(row);
    if (container) {
      const children=document.createElement("div"); children.className="tree-children";
      const entries=Array.isArray(value)?value.map((v,i)=>[i,v]):Object.entries(value);
      entries.forEach(([k,v])=>children.append(makeNode(v,k)));
      node.append(children);
      toggle.addEventListener("click",()=>{
        children.hidden=!children.hidden; const expanded=!children.hidden;
        toggle.textContent=expanded?"▼":"▶"; toggle.setAttribute("aria-label",expanded?"Collapse node":"Expand node");
        row.setAttribute("aria-expanded",String(expanded));
      });
    }
    return node;
  }

  function render(data) {
    treeRoot.replaceChildren(makeNode(data,null,true)); treeRoot.hidden=false; treeEmpty.hidden=true;
    updateTreeControls();
    searchInput.disabled=false; $("#copy-json-btn").disabled=false; searchInput.value="";
    const t=typeOf(data), count=(t==="object"||t==="array")?Object.keys(data).length:1;
    $("#tree-meta").textContent=`${t} · ${count} top-level ${count===1?"item":"items"}`;
  }

  function validate(showError=false) {
    updateLines(); const raw=input.value.trim();
    if (!raw) {
      parsedData=undefined; formattedText=""; treeRoot.replaceChildren(); treeRoot.hidden=true; treeEmpty.hidden=false;
      updateTreeControls();
      searchInput.disabled=true; $("#copy-json-btn").disabled=true; $("#tree-meta").textContent="No data loaded";
      setState("neutral","Waiting for input"); status("Ready when you are"); return false;
    }
    try {
      parsedData=JSON.parse(raw); formattedText=JSON.stringify(parsedData,null,2);
      setState("valid","Valid JSON"); render(parsedData); status("JSON validated successfully"); return true;
    } catch(err) {
      parsedData=undefined; treeRoot.replaceChildren(); treeRoot.hidden=true; treeEmpty.hidden=false;
      updateTreeControls();
      searchInput.disabled=true; $("#copy-json-btn").disabled=true; $("#tree-meta").textContent="Invalid JSON";
      setState("invalid","Invalid JSON"); status(err.message,true); if(showError) notify(err.message); return false;
    }
  }
  async function loadFile(file) {
    try {
      input.value = await file.text();
      if (validate(true)) {
        input.value = formattedText;
        updateLines();
        notify(`Loaded ${file.name}`);
      }
    } catch {
      notify("Could not read this file");
    }
  }
  function copy(text,message) {
    if (!text) return;
    const fallback=()=>{const el=document.createElement("textarea");el.value=text;el.style.position="fixed";el.style.opacity="0";document.body.append(el);el.select();try{document.execCommand("copy");notify(message)}catch{notify("Unable to copy; please copy manually")}el.remove()};
    if(navigator.clipboard&&window.isSecureContext) navigator.clipboard.writeText(text).then(()=>notify(message)).catch(fallback); else fallback();
  }
  function setApiMessage(message, type="info") {
    const element = $("#api-message");
    element.textContent = message;
    element.className = `api-message ${type}`;
    element.hidden = !message;
  }
  function clearApiResponse() {
    $("#api-empty").hidden = false;
    $("#api-response-meta").hidden = true;
    $("#api-response-headers-section").hidden = true;
    $("#api-response-body").hidden = true;
    $("#api-response-body").textContent = "";
    $("#api-response-headers").replaceChildren();
    $("#api-response-status").textContent = "—";
    $("#api-response-time").textContent = "—";
    $("#api-response-type").textContent = "—";
    $("#api-response-size").textContent = "—";
    setApiMessage("");
    setApiExplorerVisible(false);
  }
  function setApiLoading(loading) {
    apiSend.disabled = loading;
    apiCancel.disabled = !loading;
    $("#api-loading").hidden = !loading;
  }
  function activateView(view) {
    const showApi = view === "api";
    jsonViewTab.classList.toggle("active", !showApi);
    apiViewTab.classList.toggle("active", showApi);
    jsonViewTab.setAttribute("aria-selected", String(!showApi));
    apiViewTab.setAttribute("aria-selected", String(showApi));
    jsonViewTab.tabIndex = showApi ? -1 : 0;
    apiViewTab.tabIndex = showApi ? 0 : -1;
    jsonViewPanel.hidden = showApi;
    apiViewPanel.hidden = !showApi;
    if (showApi) {
      apiExplorerSlot.append(explorerPanel);
      apiExplorerSlot.hidden = !apiHasJsonResponse;
      explorerPanel.hidden = !apiHasJsonResponse;
    } else {
      jsonViewPanel.append(explorerPanel);
      apiExplorerSlot.hidden = true;
      explorerPanel.hidden = false;
    }
  }
  function setApiExplorerVisible(visible) {
    apiHasJsonResponse = visible;
    if (!apiViewPanel.hidden) {
      apiExplorerSlot.hidden = !visible;
      explorerPanel.hidden = !visible;
    }
  }
  function isExplorerActive() {
    return !searchInput.disabled &&
      (!jsonViewPanel.hidden || (apiViewPanel.contains(explorerPanel) && !explorerPanel.hidden));
  }
  function formatBytes(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  function renderApiMetadata(response, duration=null, responseSize=null) {
    $("#api-empty").hidden = true;
    $("#api-response-meta").hidden = false;
    $("#api-response-status").textContent = `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
    $("#api-response-time").textContent = duration === null ? "Receiving body…" : `${duration} ms`;
    $("#api-response-type").textContent = response.headers.get("content-type") || "Not provided";
    $("#api-response-size").textContent = responseSize === null ? "Measuring…" : `${formatBytes(responseSize)} (${responseSize.toLocaleString()} bytes)`;

    const list = $("#api-response-headers");
    list.replaceChildren();
    for (const [name, value] of response.headers.entries()) {
      const key = document.createElement("dt"), content = document.createElement("dd");
      key.textContent = name;
      content.textContent = value;
      list.append(key, content);
    }
    $("#api-response-headers-section").hidden = false;
  }
  function readRequestHeaders(raw) {
    const headers = new Headers();
    const forbidden = /^(cookie|cookie2|host|content-length|origin|referer|connection|transfer-encoding)$/i;
    raw.split(/\r?\n/).forEach((line, index) => {
      if (!line.trim()) return;
      const separator = line.indexOf(":");
      if (separator <= 0) throw new Error(`Invalid request header on line ${index + 1}. Use Name: value.`);
      const name = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (forbidden.test(name)) throw new Error(`The browser controls the "${name}" header; it cannot be set here.`);
      headers.append(name, value);
    });
    return headers;
  }
  function responseSizeError() {
    const error = new Error("Response exceeds the configured size limit.");
    error.name = "ResponseSizeLimitError";
    return error;
  }
  async function readApiResponse(response) {
    // Enforce the limit from the stream too because Content-Length can be missing or inaccurate.
    const length = response.headers.get("content-length");
    if (length && /^\d+$/.test(length) && Number(length) > MAX_API_RESPONSE_BYTES) {
      await response.body?.cancel();
      throw responseSizeError();
    }
    if (!response.body) return { text: "", size: 0 };

    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_API_RESPONSE_BYTES) {
          await reader.cancel();
          throw responseSizeError();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength; });
    return { text: new TextDecoder().decode(bytes), size };
  }
  function httpErrorMessage(response) {
    if (response.ok) return "";
    const descriptions = {
      400: "The server rejected the request.",
      401: "Authentication is required or was rejected.",
      403: "The server refused access to this resource.",
      404: "The requested resource was not found.",
      429: "The server is rate limiting requests; try again later.",
      500: "The server encountered an internal error."
    };
    const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
    return `HTTP ${status}. ${descriptions[response.status] || "The server returned an unsuccessful status."}`;
  }
  async function sendApiRequest(event) {
    event.preventDefault();
    if (apiController) return;
    clearApiResponse();
    $("#api-empty").hidden = true;

    let url;
    try {
      url = new URL(apiUrl.value.trim());
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS endpoint URLs are supported.");
      if (url.username || url.password) throw new Error("Do not put credentials in the URL; use a request header instead.");
      const credentialParameter = /token|api[_-]?key|authorization|password|passwd|secret|credential|(?:^|[_-])auth(?:$|[_-])|(?:^|[_-])key(?:$|[_-])/i;
      if ([...url.searchParams.keys()].some(key => credentialParameter.test(key))) {
        throw new Error("Do not put credentials in URL query parameters; use a request header instead.");
      }
    } catch (error) {
      setApiMessage(error.message || "Enter a valid absolute HTTP or HTTPS URL.", "error");
      return;
    }

    const method = apiMethod.value;
    let headers;
    try {
      headers = readRequestHeaders(apiHeaders.value);
    } catch (error) {
      setApiMessage(error.message, "error");
      return;
    }

    let body;
    if (method !== "GET" && apiBody.value.trim()) {
      try {
        JSON.parse(apiBody.value);
      } catch {
        setApiMessage("Request body must contain valid JSON.", "error");
        return;
      }
      body = apiBody.value;
      if (!headers.has("content-type")) headers.set("Content-Type", "application/json");
    }

    const hasSensitiveHeader = [...headers.keys()].some(name => /authorization|(?:^|[-_])auth(?:$|[-_])|cookie|token|api[-_]?key|secret|password|credential/i.test(name));
    if (url.protocol === "http:" && (hasSensitiveHeader || body) &&
      !window.confirm("This endpoint uses unencrypted HTTP. Credentials or request data may be visible to others. Send anyway?")) {
      setApiMessage("Request was not sent.", "error");
      return;
    }

    const controller = new AbortController();
    apiController = controller;
    apiTimedOut = false;
    setApiLoading(true);
    const started = performance.now();
    const timeout = setTimeout(() => {
      if (apiController === controller) {
        apiTimedOut = true;
        controller.abort();
      }
    }, API_REQUEST_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(url.href, {
        method,
        headers,
        body,
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer"
      });
      if (apiController !== controller) return;
      renderApiMetadata(response);
      const { text, size } = await readApiResponse(response);
      if (apiController !== controller) return;
      const duration = Math.round(performance.now() - started);
      renderApiMetadata(response, duration, size);

      const contentType = response.headers.get("content-type") || "";
      const trimmed = text.trim();
      let data, validJson = false;
      if (trimmed) {
        try {
          data = JSON.parse(text);
          validJson = true;
        } catch {
          validJson = false;
        }
      }

      const httpMessage = httpErrorMessage(response);
      const messageType = response.ok ? "success" : "error";
      if (validJson) {
        const formattedJson = JSON.stringify(data, null, 2);
        input.value = formattedJson;
        validate();
        $("#api-response-body").hidden = true;
        setApiExplorerVisible(true);
        setApiMessage([httpMessage, "Valid JSON loaded into the Explorer and existing JSON editor."].filter(Boolean).join(" "), messageType);
      } else {
        setApiExplorerVisible(false);
        $("#api-response-body").textContent = text;
        $("#api-response-body").hidden = !trimmed;
        const looksLikeJson = /^(?:\{|\[|")/.test(trimmed);
        const invalidJson = /\bjson\b|\+json\b/i.test(contentType) || looksLikeJson;
        let bodyMessage;
        if (!trimmed) bodyMessage = "The response body is empty.";
        else if (invalidJson) {
          bodyMessage = "The response appears to be JSON but is invalid. It is shown as text; the existing JSON Viewer was not changed.";
        } else {
          bodyMessage = "Response shown as plain text. HTML and scripts are not executed.";
        }
        setApiMessage([httpMessage, bodyMessage].filter(Boolean).join(" "), response.ok ? (invalidJson ? "error" : "info") : "error");
      }
    } catch (error) {
      if (apiController !== controller) return;
      if (response) renderApiMetadata(response, Math.round(performance.now() - started));
      if (error.name === "ResponseSizeLimitError") {
        if (response) {
          const length = Number(response.headers.get("content-length"));
          $("#api-response-size").textContent = Number.isFinite(length) && length > 0
            ? `${formatBytes(length)} (declared; body not downloaded)`
            : `More than ${formatBytes(MAX_API_RESPONSE_BYTES)} (limit exceeded)`;
        }
        setApiMessage("Response exceeded the 5 MiB limit and was cancelled.", "error");
      } else if (apiTimedOut) {
        setApiMessage("Request timed out after 30 seconds.", "error");
      } else if (controller.signal.aborted) {
        setApiMessage("Request cancelled.", "error");
      } else if (error instanceof TypeError) {
        setApiMessage("Network or CORS error. Check the URL, connection, and whether the API allows browser cross-origin requests. Browser CORS restrictions cannot be bypassed by this app.", "error");
      } else {
        setApiMessage(`Request failed: ${error.message}`, "error");
      }
    } finally {
      clearTimeout(timeout);
      if (apiController === controller) {
        apiController = null;
        setApiLoading(false);
      }
    }
  }
  function clearApiRequest() {
    const controller = apiController;
    apiController = null;
    if (controller) controller.abort();
    apiForm.reset();
    updateApiBodyAvailability();
    clearApiResponse();
    setApiLoading(false);
  }
  function updateApiBodyAvailability() {
    const canSendBody = apiMethod.value !== "GET";
    apiBody.disabled = !canSendBody;
    $("#api-body-hint").textContent = canSendBody
      ? "Optional JSON body. It will be sent with an application/json content type."
      : "GET requests do not send a request body.";
  }
  function setTimestampResults(date) {
    const valid = date && Number.isFinite(date.getTime());
    const values = valid ? { "timestamp-utc": date.toUTCString() } : {};
    Object.entries(values).forEach(([id, value]) => { $(`#${id}`).textContent = value; });
    document.querySelectorAll(".timestamp-copy").forEach(button => {
      const value = values[button.dataset.copyTarget];
      button.disabled = !value;
    });
    if (!valid) {
      $("#timestamp-utc").textContent = "—";
    }
    return valid;
  }
  function updateFromTimestamp() {
    const raw = timestampInput.value.trim();
    const detection = $("#timestamp-detection");
    if (!raw) {
      detection.textContent = "Enter a timestamp in seconds or milliseconds.";
      dateInput.value = "";
      setTimestampResults(null);
      return;
    }
    const timestamp = Number(raw);
    if (!Number.isFinite(timestamp)) {
      detection.textContent = "Enter a valid numeric timestamp.";
      dateInput.value = "";
      setTimestampResults(null);
      return;
    }
    const isMilliseconds = Math.abs(timestamp) >= 1e11;
    const milliseconds = isMilliseconds ? timestamp : timestamp * 1000;
    const date = new Date(milliseconds);
    if (!Number.isFinite(date.getTime())) {
      detection.textContent = "Timestamp is outside the supported date range.";
      dateInput.value = "";
      setTimestampResults(null);
      return;
    }
    detection.textContent = `Detected ${isMilliseconds ? "milliseconds" : "seconds"}`;
    const pad = value => String(value).padStart(2, "0");
    dateInput.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, "0")}`;
    setTimestampResults(date);
  }
  function updateFromDate() {
    if (!dateInput.value) {
      timestampInput.value = "";
      $("#timestamp-detection").textContent = "Enter a timestamp in seconds or milliseconds.";
      setTimestampResults(null);
      return;
    }
    const date = new Date(dateInput.value);
    if (!setTimestampResults(date)) return;
    timestampInput.value = String(date.getTime() / 1000);
    $("#timestamp-detection").textContent = "Date converted to timestamp";
  }
  function expandAll(expand) {
    treeRoot.querySelectorAll(".tree-children").forEach(el=>{
      el.hidden=!expand; const row=el.previousElementSibling, btn=row?.querySelector(".tree-toggle");
      if(btn){btn.textContent=expand?"▼":"▶";btn.setAttribute("aria-label",expand?"Collapse node":"Expand node")}
      if(row) row.setAttribute("aria-expanded",String(expand));
    });
  }
  function search() {
    const q=searchInput.value.trim().toLowerCase();
    const rows=[...treeRoot.querySelectorAll(".tree-row")]; rows.forEach(r=>r.classList.remove("match"));
    if(!q){if(parsedData!==undefined){const t=typeOf(parsedData);$("#tree-meta").textContent=`${t} · ${Object.keys(parsedData).length} top-level items`}return}
    rows.forEach(row=>{
      if(!row.textContent.toLowerCase().includes(q)) return;
      row.classList.add("match"); let parent=row.parentElement;
      while(parent&&parent!==treeRoot){
        if(parent.classList.contains("tree-children")){
          parent.hidden=false; const pr=parent.previousElementSibling, btn=pr?.querySelector(".tree-toggle");
          if(btn)btn.textContent="▼"; if(pr)pr.setAttribute("aria-expanded","true");
        } parent=parent.parentElement;
      }
    });
    const matches=treeRoot.querySelectorAll(".tree-row.match").length;
    $("#tree-meta").textContent=`${matches} ${matches===1?"match":"matches"}`;
  }

  input.addEventListener("input",()=>validate());
  themeToggle.addEventListener("click",()=>setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));
  input.addEventListener("scroll",()=>{lineNumbers.scrollTop=input.scrollTop});
  input.addEventListener("keydown",e=>{if(e.key==="Tab"){e.preventDefault();input.setRangeText("  ",input.selectionStart,input.selectionEnd,"end");validate()}});
  $("#format-btn").addEventListener("click",()=>{if(validate()){input.value=formattedText;validate();notify("JSON formatted")}});
  $("#minify-btn").addEventListener("click",()=>{if(validate()){input.value=JSON.stringify(parsedData);validate();notify("JSON minified")}});
  $("#sample-btn").addEventListener("click",()=>{input.value=JSON.stringify(sample,null,2);validate();notify("Sample JSON loaded")});
  $("#clear-btn").addEventListener("click",()=>{input.value="";validate();input.focus()});
  $("#file-input").addEventListener("change",async e=>{
    const file=e.target.files?.[0];if(!file)return;
    await loadFile(file);
    e.target.value="";
  });
  editorWrap.addEventListener("dragenter",e=>{
    if(!e.dataTransfer?.types.includes("Files"))return;
    e.preventDefault(); dragDepth++; editorWrap.classList.add("drag-over");
  });
  editorWrap.addEventListener("dragover",e=>{
    if(!e.dataTransfer?.types.includes("Files"))return;
    e.preventDefault(); e.dataTransfer.dropEffect="copy";
  });
  editorWrap.addEventListener("dragleave",e=>{
    if(!e.dataTransfer?.types.includes("Files"))return;
    e.preventDefault(); dragDepth=Math.max(0,dragDepth-1);
    if(!dragDepth)editorWrap.classList.remove("drag-over");
  });
  editorWrap.addEventListener("drop",async e=>{
    if(!e.dataTransfer?.files.length)return;
    e.preventDefault(); dragDepth=0; editorWrap.classList.remove("drag-over");
    await loadFile(e.dataTransfer.files[0]);
  });
  $("#copy-json-btn").addEventListener("click",()=>{if(parsedData!==undefined)copy(JSON.stringify(parsedData,null,2),"JSON copied to clipboard")});
  $("#expand-btn").addEventListener("click",()=>expandAll(true));
  $("#collapse-btn").addEventListener("click",()=>expandAll(false));
  jsonViewTab.addEventListener("click",()=>activateView("json"));
  apiViewTab.addEventListener("click",()=>activateView("api"));
  [jsonViewTab,apiViewTab].forEach(tab=>tab.addEventListener("keydown",e=>{
    if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;
    e.preventDefault();
    const next=e.key==="ArrowRight"?apiViewTab:jsonViewTab;
    activateView(next===apiViewTab?"api":"json");next.focus();
  }));
  apiForm.addEventListener("submit",sendApiRequest);
  apiMethod.addEventListener("change",updateApiBodyAvailability);
  apiCancel.addEventListener("click",()=>apiController?.abort());
  $("#api-clear").addEventListener("click",clearApiRequest);
  searchInput.addEventListener("input",search);
  timestampInput.addEventListener("input",updateFromTimestamp);
  dateInput.addEventListener("input",updateFromDate);
  document.querySelectorAll(".timestamp-copy").forEach(button => {
    button.addEventListener("click", () => {
      const output = $(`#${button.dataset.copyTarget}`);
      if (output.textContent !== "—") copy(output.textContent, "Timestamp result copied");
    });
  });
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&document.activeElement===searchInput){e.preventDefault();searchInput.value="";search();(jsonViewPanel.hidden?apiUrl:input).focus();return}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="f"&&isExplorerActive()){e.preventDefault();searchInput.focus();searchInput.select();return}
    if(e.altKey&&e.shiftKey&&!e.ctrlKey&&!e.metaKey&&e.code==="KeyF"&&!jsonViewPanel.hidden){e.preventDefault();$("#format-btn").click();return}
    if(e.altKey&&e.shiftKey&&!e.ctrlKey&&!e.metaKey&&e.code==="KeyJ"&&!jsonViewPanel.hidden){e.preventDefault();$("#minify-btn").click();return}
    if(e.key==="/"&&!["INPUT","TEXTAREA"].includes(document.activeElement.tagName)&&isExplorerActive()){e.preventDefault();searchInput.focus()}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="enter"&&!jsonViewPanel.hidden){e.preventDefault();$("#format-btn").click()}
  });
  loadTheme(); updateApiBodyAvailability(); setApiLoading(false); updateLines(); validate();
})();
