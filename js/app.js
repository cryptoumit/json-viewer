(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const input = $("#json-input"), treeRoot = $("#tree-root"), treeEmpty = $("#tree-empty");
  const editorWrap = $(".editor-wrap");
  const inputState = $("#input-state"), lineNumbers = $("#line-numbers"), searchInput = $("#search-input");
  const toast = $("#toast"), themeToggle = $("#theme-toggle");
  const timestampInput = $("#timestamp-input"), dateInput = $("#date-input");
  let parsedData, formattedText = "", toastTimer;
  let dragDepth = 0;

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
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
    themeToggle.textContent = isLight ? "☾" : "☼";
    themeToggle.setAttribute("aria-label", `Switch to ${isLight ? "dark" : "light"} mode`);
    themeToggle.setAttribute("aria-pressed", String(isLight));
    themeToggle.title = `Switch to ${isLight ? "dark" : "light"} mode`;
    $('meta[name="theme-color"]').content = isLight ? "#f3f5fa" : "#0b1020";
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
      if (validate(true)) notify(`Loaded ${file.name}`);
    } catch {
      notify("Could not read this file");
    }
  }
  function copy(text,message) {
    if (!text) return;
    const fallback=()=>{const el=document.createElement("textarea");el.value=text;el.style.position="fixed";el.style.opacity="0";document.body.append(el);el.select();try{document.execCommand("copy");notify(message)}catch{notify("Unable to copy; please copy manually")}el.remove()};
    if(navigator.clipboard&&window.isSecureContext) navigator.clipboard.writeText(text).then(()=>notify(message)).catch(fallback); else fallback();
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
    if(e.key==="/"&&!["INPUT","TEXTAREA"].includes(document.activeElement.tagName)&&!searchInput.disabled){e.preventDefault();searchInput.focus()}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="enter"){e.preventDefault();$("#format-btn").click()}
  });
  updateLines(); validate();
})();