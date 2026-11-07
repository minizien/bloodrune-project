import { db } from "./firebase-config.js";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { logAdminAction } from "./HTowner.js"; // ✅ นำเข้าฟังก์ชันบันทึกประวัติกิจกรรมแอดมิน

export let projects = [];
let currentProjectIndex = null;
let selectedAppIndexForInterview = null;
let currentProjectIndexForWindow3 = null;
window.isAdminOwner = false;

export function isCountedAsPassed(status) {
  const countedStatuses = [
    "step_1_2_passed", "passed", "step_2_submitted", "stage2_submitted",
    "step_2_revision", "revision_requested", "step_1_9_5_requested",
    "edit_requested", "step_1_9_5_allowed", "edit_allowed",
    "step_3_approved", "approved", "step_3_completed", "completed",
    "step_1_2_5_pending", "role_pending_review", "step_1_2_5_revision"
  ];
  return countedStatuses.includes(status);
}

export function initProjectModule() {
  const auth = getAuth();
  if (auth.currentUser) {
    getDoc(doc(db, "users", auth.currentUser.uid)).then((docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const r = (data.RoleUser || data.role || "").toUpperCase();
        window.isAdminOwner = (r === "OWNER");
        renderProjects();
      }
    }).catch(() => {});
  }

  onSnapshot(collection(db, "projects"), (snapshot) => {
    projects = [];
    snapshot.forEach((docSnap) => {
      projects.push({ firebaseId: docSnap.id, ...docSnap.data() });
    });

    projects.sort((a, b) => {
      const getTime = (val) => {
        if (!val) return 0;
        if (typeof val.toDate === 'function') return val.toDate().getTime();
        const parsed = new Date(val).getTime();
        return isNaN(parsed) ? 0 : parsed;
      };
      return getTime(b.createdAt) - getTime(a.createdAt);
    });

    renderProjects();
    if (currentProjectIndex !== null) {
      window.renderApplicationsList();
    }
    if (currentProjectIndexForWindow3 !== null) {
      renderProjectNewsList();
      renderCombinedMemberList();
    }
  });
}

window.renderProjects = function() {
  const container = document.getElementById("projectList");
  if (!container) return;

  const searchInputElem = document.getElementById("adminProjSearch");
  const keyword = searchInputElem ? searchInputElem.value.toLowerCase().trim() : "";
  container.innerHTML = "";

  const isOwner = window.isAdminOwner === true;

  if (projects.length === 0) {
    container.innerHTML = '<p style="color:#888; grid-column: 1/-1; text-align:center;">ยังไม่มีโปรเจกต์ในระบบ Firebase</p>';
    return;
  }

  const filteredProjects = projects.filter(proj => 
    proj.name && proj.name.toLowerCase().includes(keyword)
  );

  if (filteredProjects.length === 0) {
    container.innerHTML = '<p style="color:#888; grid-column: 1/-1; text-align:center;">ไม่พบโปรเจกต์ที่ค้นหา</p>';
    return;
  }

  filteredProjects.forEach((proj) => {
    const index = projects.indexOf(proj);
    const projStatus = proj.status || (proj.hidden === true || proj.hidden === "true" ? "hidden" : "open");
    
    let statusBadgeText = " เปิดรับสมัคร ";
    let statusBadgeClass = "status-active";
    if (projStatus === "closed") {
      statusBadgeText = " ปิดรับสมัคร ";
      statusBadgeClass = "status-closed";
    } else if (projStatus === "hidden") {
      statusBadgeText = " ซ่อนอยู่ ";
      statusBadgeClass = "status-hidden";
    }

    const approvedCount = proj.applications
      ? proj.applications.filter((a) => isCountedAsPassed(a.status)).length
      : 0;
    const remainingSeats = Math.max(0, Number(proj.maxMembers) - approvedCount);

    let rolesHtml = "";
    if (proj.roles) {
      proj.roles.forEach((r) => {
        const filledInRole = proj.applications
          ? proj.applications.filter(
              (a) => isCountedAsPassed(a.status) && a.assignedRole === r.name,
            ).length
          : 0;
        const leftInRole = Math.max(0, Number(r.count) - filledInRole);
        rolesHtml += `<li>- ${r.name}: ผ่านแล้ว ${filledInRole}/${r.count} คน (เหลือ ${leftInRole} ที่)</li>`;
      });
    }

    let imagePreviewHtml = "";
    if (proj.imageUrl) {
      const urls = proj.imageUrl.split(/[\n,]+/).map((u) => u.trim()).filter((u) => u.length > 0);
      if (urls.length > 0) {
        let imgs = "";
        urls.forEach((url) => {
          imgs += `<div style="flex: 0 0 100px; height: 80px; border-radius: 4px; overflow: hidden; background: #000; border: 1px solid #333;"><img src="${url}" alt="Project Img" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'"/></div>`;
        });
        imagePreviewHtml = `<div style="display: flex; gap: 8px; overflow-x: auto; margin-bottom: 10px; padding-bottom: 5px;">${imgs}</div>`;
      }
    }

    let descHtml = proj.description ? `<p style="font-size: 0.85rem; color: #bbb; margin-bottom: 8px; font-style: italic;">"${proj.description}"</p>` : "";

    let ownerProjectButtonsHtml = "";
    if (isOwner) {
      ownerProjectButtonsHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px;">
          <button class="btn-secondary" onclick="editProject(${index})" style="background:#2a2a2a; width:100%;">⚙️ ตั้งค่าโปรเจกต์</button>
          <button class="btn-secondary" style="background: #c9302c; width:100%;" onclick="deleteProject(${index})">🗑️ ลบโปรเจกต์</button>
        </div>
      `;
    }

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      ${imagePreviewHtml}
      <span class="card-status ${statusBadgeClass}">${statusBadgeText}</span>
      <h4 class="card-title">${proj.name}</h4>${descHtml}
      <div class="card-info">
        <p><strong>ความจุ:</strong> ทั้งหมด ${proj.maxMembers} คน | ผ่านแล้ว <span style="color:#28a745; font-weight:bold;">${approvedCount}</span> คน | เหลือ <span style="color:#ff2a2a; font-weight:bold;">${remainingSeats}</span> ที่</p>
        <p style="margin-top:6px;"><strong>สถานะบทบาท:</strong></p>
        <ul style="padding-left: 15px; font-size: 0.85rem; color: #ccc;">${rolesHtml}</ul>
      </div>
      
      <div class="card-actions" style="margin-top: 12px; display: flex; flex-direction: column; gap: 6px;">
        ${ownerProjectButtonsHtml}
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <button class="btn-secondary" onclick="viewApps(${index})" style="background:#444; width:100%;">📋 ผู้สมัคร (${proj.applications ? proj.applications.length : 0})</button>
          <button class="btn-secondary" onclick="openProjectWindow3(${index})" style="background:#28a745; width:100%;">📢 บอร์ด (3)</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
};

window.openProjectModal = function () {
  if (!window.isAdminOwner) {
    alert("⚠️ เฉพาะผู้ใช้งานระดับ OWNER เท่านั้นที่มีสิทธิ์สร้างโปรเจกต์ใหม่!");
    return;
  }

  document.getElementById("projectModalTitle").innerText = "⚙️ สร้างโปรเจกต์ใหม่";
  document.getElementById("projId").value = "";
  document.getElementById("projName").value = "";
  if (document.getElementById("projImageUrl")) document.getElementById("projImageUrl").value = "";
  if (document.getElementById("projDescription")) document.getElementById("projDescription").value = "";
  document.getElementById("projMaxMembers").value = "";
  
  const statusSelect = document.getElementById("projStatus");
  if (statusSelect) statusSelect.value = "open";

  document.getElementById("roleInputsContainer").innerHTML = "";
  document.getElementById("customQuestionsContainer").innerHTML = "";
  document.getElementById("stage2QuestionsContainer").innerHTML = "";
  document.getElementById("stage2Description").value = "กรุณากรอกข้อมูลและแนบลิงก์รูปภาพประกอบตามหัวข้อด้านล่างให้ครบถ้วน";

  window.addRoleInput();
  window.addQuestionInput("วันเดือนปีเกิด", "date", []);
  window.addQuestionInput("อีเมลติดต่อกลับ", "email", []);
  window.addQuestionInput("เคยเล่นโรลมาก่อนไหม", "radio", ["เคย", "ไม่เคย"]);
  window.addStage2QuestionInput("ลิงก์ช่องทางติดต่อเพิ่มเติม (Discord / Facebook)", "text", [], "");

  if (typeof switchProjectTab === "function") switchProjectTab(1);
  document.getElementById("projectModal").classList.add("open");
};

window.closeProjectModal = function () {
  document.getElementById("projectModal").classList.remove("open");
};

window.addRoleInput = function (name = "", count = "") {
  const container = document.getElementById("roleInputsContainer");
  const div = document.createElement("div");
  div.className = "role-row";
  div.style.cssText = "display: flex; gap: 8px; margin-bottom: 8px;";
  div.innerHTML = `
    <input type="text" placeholder="ชื่อบทบาท (เช่น Dev)" class="role-name" value="${name}" required style="flex:1; padding: 8px; background: #141414; border: 1px solid #333; color: #fff; border-radius: 4px;" />
    <input type="number" placeholder="จำนวน" class="role-count" value="${count}" min="1" required style="width: 90px; padding: 8px; background: #141414; border: 1px solid #333; color: #fff; border-radius: 4px;" />
    <button type="button" onclick="this.parentElement.remove()" style="background:#ff2a2a; color:#fff; border:none; padding:0 12px; border-radius:4px; cursor:pointer;">✕</button>
  `;
  container.appendChild(div);
};

window.addQuestionInput = function (qText = "", qType = "text", optionsList = []) {
  const container = document.getElementById("customQuestionsContainer");
  const div = document.createElement("div");
  div.className = "question-row";
  div.style.cssText = "display: flex; flex-direction: column; width: 100%; box-sizing: border-box; background: #222; border: 1px solid #3c3c3c; border-left: 4px solid #4a90e2; padding: 16px; border-radius: 8px; margin-bottom: 14px;";

  const isMultiType = ['radio', 'checkbox', 'select'].includes(qType);

  div.innerHTML = `
    <div style="display: flex; width: 100%; gap: 12px; align-items: center; box-sizing: border-box;">
      <input type="text" placeholder="หัวข้อคำถาม" class="question-title" value="${qText}" required style="flex: 2; width: 100%; padding: 10px 12px; background: #181818; border: 1px solid #444; color: #fff; border-radius: 6px; font-size: 0.95rem; box-sizing: border-box;" />
      <select class="question-type" style="flex: 1; padding: 10px 12px; background: #181818; border: 1px solid #444; color: #fff; border-radius: 6px; font-size: 0.9rem; box-sizing: border-box;" onchange="toggleOptionsBuilder(this)">
        <option value="text" ${qType === "text" ? "selected" : ""}>📝 ข้อความสั้น</option>
        <option value="textarea" ${qType === "textarea" ? "selected" : ""}>📄 ข้อความยาว</option>
        <option value="radio" ${qType === "radio" ? "selected" : ""}>🔘 หลายตัวเลือก</option>
        <option value="checkbox" ${qType === "checkbox" ? "selected" : ""}>☑️ ช่องทำเครื่องหมาย</option>
        <option value="select" ${qType === "select" ? "selected" : ""}>🔽 ดร็อปดาวน์</option>
        <option value="number" ${qType === "number" ? "selected" : ""}>🔢 ตัวเลข</option>
        <option value="date" ${qType === "date" ? "selected" : ""}>📅 วันที่</option>
        <option value="email" ${qType === "email" ? "selected" : ""}>📧 อีเมล</option>
      </select>
    </div>
    <div class="options-builder-area" style="display: ${isMultiType ? 'block' : 'none'}; width: 100%; margin-top: 12px; padding-top: 10px; border-top: 1px dashed #383838; box-sizing: border-box;">
      <div class="options-list-container" style="display: flex; flex-direction: column; width: 100%; gap: 10px; margin-bottom: 10px;"></div>
      <button type="button" onclick="addOptionRow(this)" style="background: transparent; color: #4a90e2; border: 1px dashed #4a90e2; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: bold;">➕ เพิ่มตัวเลือก</button>
    </div>
    <div style="display: flex; width: 100%; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 14px; padding-top: 10px; border-top: 1px solid #2d2d2d; box-sizing: border-box;">
      <button type="button" onclick="moveQuestionRow(this, -1)" style="background:#2a2a2a; color:#ccc; border:1px solid #444; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.85rem;">▲ เลื่อนขึ้น</button>
      <button type="button" onclick="moveQuestionRow(this, 1)" style="background:#2a2a2a; color:#ccc; border:1px solid #444; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.85rem;">▼ เลื่อนลง</button>
      <button type="button" onclick="this.closest('.question-row').remove()" style="background:#c9302c; color:#fff; border:none; padding:6px 14px; border-radius:4px; cursor:pointer; font-weight:bold; font-size: 0.85rem;">🗑️ ลบคำถาม</button>
    </div>
  `;
  container.appendChild(div);

  const optsContainer = div.querySelector('.options-list-container');
  if (Array.isArray(optionsList) && optionsList.length > 0) {
    optionsList.forEach(optVal => createOptionItemUI(optsContainer, optVal, qType));
  } else if (isMultiType) {
    createOptionItemUI(optsContainer, "ตัวเลือกที่ 1", qType);
  }
};

window.addStage2QuestionInput = function (qText = "", qType = "text", optionsList = [], placeholder = "") {
  const container = document.getElementById("stage2QuestionsContainer");
  const wrapper = document.createElement("div");
  wrapper.className = "stage2-question-row";
  wrapper.style.cssText = "display: flex; flex-direction: column; width: 100%; box-sizing: border-box; background: #222; border: 1px solid #3c3c3c; border-left: 4px solid #17a2b8; padding: 16px; border-radius: 8px; margin-bottom: 14px;";

  const isMultiType = ['radio', 'checkbox', 'select'].includes(qType);

  wrapper.innerHTML = `
    <div style="display: flex; width: 100%; gap: 12px; align-items: center; box-sizing: border-box;">
      <input type="text" placeholder="หัวข้อคำถาม / ชื่อเอกสาร" class="s2-q-title" value="${qText}" required style="flex: 2; width: 100%; padding: 10px 12px; background: #181818; border: 1px solid #444; color: #fff; border-radius: 6px; font-size: 0.95rem; box-sizing: border-box;" />
      <select class="s2-q-type" style="flex: 1; padding: 10px 12px; background: #181818; border: 1px solid #444; color: #fff; border-radius: 6px; font-size: 0.9rem; box-sizing: border-box;" onchange="toggleOptionsBuilder(this)">
        <option value="text" ${qType === "text" ? "selected" : ""}>📝 ข้อความสั้น</option>
        <option value="textarea" ${qType === "textarea" ? "selected" : ""}>📄 ข้อความยาว</option>
        <option value="radio" ${qType === "radio" ? "selected" : ""}>🔘 หลายตัวเลือก</option>
        <option value="checkbox" ${qType === "checkbox" ? "selected" : ""}>☑️ ช่องทำเครื่องหมาย</option>
        <option value="select" ${qType === "select" ? "selected" : ""}>🔽 ดร็อปดาวน์</option>
        <option value="number" ${qType === "number" ? "selected" : ""}>🔢 ตัวเลข</option>
        <option value="date" ${qType === "date" ? "selected" : ""}>📅 วันที่</option>
        <option value="email" ${qType === "email" ? "selected" : ""}>📧 อีเมล</option>
        <option value="image" ${qType === "image" ? "selected" : ""}>📷 อัปโหลดภาพ / รูปเอกสาร</option>
      </select>
    </div>
    <div class="question-preview-area" style="width: 100%; margin-top: 12px; padding: 10px 12px; background: #181818; border: 1px dashed #444; border-radius: 6px; box-sizing: border-box;">
      <input type="text" class="q-placeholder-input" value="${placeholder}" placeholder="[คำอธิบาย / ข้อความช่วยเหลือ]" style="width: 100%; padding: 8px 10px; background: #111; border: 1px solid #333; color: #fff; border-radius: 4px; font-size: 0.85rem; box-sizing: border-box;" />
    </div>
    <div class="options-builder-area" style="display: ${isMultiType ? 'block' : 'none'}; width: 100%; margin-top: 12px; padding-top: 10px; border-top: 1px dashed #383838; box-sizing: border-box;">
      <div class="options-list-container" style="display: flex; flex-direction: column; width: 100%; gap: 10px; margin-bottom: 10px;"></div>
      <button type="button" onclick="addOptionRow(this)" style="background: transparent; color: #17a2b8; border: 1px dashed #17a2b8; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: bold;">➕ เพิ่มตัวเลือก</button>
    </div>
    <div style="display: flex; width: 100%; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 14px; padding-top: 10px; border-top: 1px solid #2d2d2d; box-sizing: border-box;">
      <button type="button" onclick="moveQuestionRow(this, -1)" style="background:#2a2a2a; color:#ccc; border:1px solid #444; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.85rem;">▲ เลื่อนขึ้น</button>
      <button type="button" onclick="moveQuestionRow(this, 1)" style="background:#2a2a2a; color:#ccc; border:1px solid #444; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.85rem;">▼ เลื่อนลง</button>
      <button type="button" onclick="this.closest('.stage2-question-row').remove()" style="background:#c9302c; color:#fff; border:none; padding:6px 14px; border-radius:4px; cursor:pointer; font-weight:bold; font-size: 0.85rem;">🗑️ ลบคำถาม</button>
    </div>
  `;
  container.appendChild(wrapper);

  const optsContainer = wrapper.querySelector('.options-list-container');
  if (Array.isArray(optionsList) && optionsList.length > 0) {
    optionsList.forEach(optVal => createOptionItemUI(optsContainer, optVal, qType));
  } else if (isMultiType) {
    createOptionItemUI(optsContainer, "ตัวเลือกที่ 1", qType);
  }
};

function createOptionItemUI(container, value = "", type = "radio") {
  const div = document.createElement("div");
  div.className = "option-item-row";
  div.style.cssText = "display: flex; width: 100%; align-items: center; gap: 10px; box-sizing: border-box;";

  let iconSymbol = "⚪";
  if (type === "checkbox") iconSymbol = "◻️";
  if (type === "select") iconSymbol = "1.";

  div.innerHTML = `
    <span class="option-type-icon" style="color: #888; font-size: 0.9rem; width: 24px; text-align: center; flex-shrink: 0;">${iconSymbol}</span>
    <input type="text" class="opt-val-input" value="${value}" placeholder="ข้อความตัวเลือก" required style="flex: 1; padding: 8px 12px; background: #141414; border: 1px solid #383838; color: #fff; border-radius: 4px; font-size: 0.88rem; box-sizing: border-box;" />
    <button type="button" onclick="this.parentElement.remove()" style="background: transparent; color: #888; border: none; font-size: 1.1rem; cursor: pointer; padding: 0 8px; flex-shrink: 0;">✕</button>
  `;
  container.appendChild(div);
}

window.toggleOptionsBuilder = function (selectElem) {
  const row = selectElem.closest('.question-row') || selectElem.closest('.stage2-question-row');
  if (!row) return;
  const area = row.querySelector('.options-builder-area');
  const container = row.querySelector('.options-list-container');
  const type = selectElem.value;

  if (['radio', 'checkbox', 'select'].includes(type)) {
    area.style.display = 'block';
    if (container.children.length === 0) {
      createOptionItemUI(container, "ตัวเลือกที่ 1", type);
    } else {
      let iconSymbol = "⚪";
      if (type === "checkbox") iconSymbol = "◻️";
      if (type === "select") iconSymbol = "1.";
      container.querySelectorAll('.option-type-icon').forEach(icon => icon.innerText = iconSymbol);
    }
  } else {
    area.style.display = 'none';
  }
};

window.addOptionRow = function (btnElem) {
  const row = btnElem.closest('.question-row') || btnElem.closest('.stage2-question-row');
  const typeSelect = row.querySelector('.question-type') || row.querySelector('.s2-q-type');
  const container = row.querySelector('.options-list-container');
  const type = typeSelect ? typeSelect.value : 'radio';
  const count = container.children.length + 1;
  createOptionItemUI(container, `ตัวเลือกที่ ${count}`, type);
};

window.moveQuestionRow = function (btn, direction) {
  const row = btn.closest('.question-row') || btn.closest('.stage2-question-row');
  if (!row) return;
  const container = row.parentElement;
  
  if (direction === -1 && row.previousElementSibling) {
    container.insertBefore(row, row.previousElementSibling);
  } else if (direction === 1 && row.nextElementSibling) {
    container.insertBefore(row.nextElementSibling, row);
  }
};

window.handleSaveProject = async function (e) {
  e.preventDefault();
  if (!window.isAdminOwner) {
    alert("⚠️ เฉพาะผู้ใช้งานระดับ OWNER เท่านั้นที่มีสิทธิ์บันทึก/แก้ไขโปรเจกต์!");
    return;
  }

  const index = document.getElementById("projId").value;
  const name = document.getElementById("projName").value.trim();
  const imageUrl = document.getElementById("projImageUrl") ? document.getElementById("projImageUrl").value.trim() : "";
  const description = document.getElementById("projDescription") ? document.getElementById("projDescription").value.trim() : "";
  const maxMembers = Number(document.getElementById("projMaxMembers").value);
  
  const statusElem = document.getElementById("projStatus");
  const status = statusElem ? statusElem.value : "open";
  const hidden = (status === "hidden");

  const roleNames = document.querySelectorAll(".role-name");
  const roleCounts = document.querySelectorAll(".role-count");
  let roles = [];
  let totalRolesCount = 0;
  for (let i = 0; i < roleNames.length; i++) {
    const rName = roleNames[i].value.trim();
    const rCount = Number(roleCounts[i].value);
    if (rName && rCount > 0) {
      roles.push({ name: rName, count: rCount });
      totalRolesCount += rCount;
    }
  }

  const roleErrorElem = document.getElementById("roleError");
  if (totalRolesCount > maxMembers) {
    if (roleErrorElem) roleErrorElem.style.display = "block";
    if (typeof switchProjectTab === "function") switchProjectTab(2);
    return;
  }
  if (roleErrorElem) roleErrorElem.style.display = "none";

  const questionRows = document.querySelectorAll("#customQuestionsContainer .question-row");
  let customQuestions = [];
  questionRows.forEach(row => {
    const title = row.querySelector(".question-title").value.trim();
    const type = row.querySelector(".question-type").value;
    let options = [];
    if (['radio', 'checkbox', 'select'].includes(type)) {
      row.querySelectorAll(".opt-val-input").forEach(input => {
        const val = input.value.trim();
        if (val) options.push(val);
      });
    }
    if (title !== "") customQuestions.push({ title, type, options });
  });

  const stage2Description = document.getElementById("stage2Description") ? document.getElementById("stage2Description").value.trim() : "";
  const s2QuestionRows = document.querySelectorAll("#stage2QuestionsContainer .stage2-question-row");
  let stage2Questions = [];
  s2QuestionRows.forEach(row => {
    const title = row.querySelector(".s2-q-title").value.trim();
    const type = row.querySelector(".s2-q-type").value;
    const placeholder = row.querySelector(".q-placeholder-input") ? row.querySelector(".q-placeholder-input").value.trim() : "";
    let options = [];
    if (['radio', 'checkbox', 'select'].includes(type)) {
      row.querySelectorAll(".opt-val-input").forEach(input => {
        const val = input.value.trim();
        if (val) options.push(val);
      });
    }
    if (title !== "") stage2Questions.push({ title, type, options, placeholder });
  });

  const currentDateTime = new Date().toLocaleString("th-TH");
  const projData = {
    name, imageUrl, description, maxMembers, status, hidden, roles, customQuestions,
    stage2Description, stage2Questions,
    updatedAt: serverTimestamp(), updatedAtString: currentDateTime,
  };

  try {
    if (index !== "") {
      const oldProjData = projects[index] || null;
      await updateDoc(doc(db, "projects", projects[index].firebaseId), projData);
      await logAdminAction("แก้ไขโปรเจกต์", `แก้ไขข้อมูลโปรเจกต์ "${name}"`, oldProjData, projData);
    } else {
      projData.applications = [];
      projData.projectNews = [];
      projData.subServerStatuses = [
        { name: "ว่าง", color: "#28a745" },
        { name: "ไม่ว่าง", color: "#c9302c" }
      ];
      projData.createdAt = serverTimestamp();
      projData.createdAtString = currentDateTime;
      await addDoc(collection(db, "projects"), projData);
      await logAdminAction("สร้างโปรเจกต์ใหม่", `สร้างโปรเจกต์ "${name}"`, null, projData);
    }
    window.closeProjectModal();
    alert("✅ บันทึกตั้งค่าโปรเจกต์สำเร็จ!");
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
};

window.editProject = function (index) {
  if (!window.isAdminOwner) {
    alert("⚠️ เฉพาะผู้ใช้งานระดับ OWNER เท่านั้นที่มีสิทธิ์แก้ไขโปรเจกต์!");
    return;
  }

  const proj = projects[index];
  document.getElementById("projectModalTitle").innerText = "⚙️ แก้ไขตั้งค่าโปรเจกต์";
  document.getElementById("projId").value = index;
  document.getElementById("projName").value = proj.name;
  if (document.getElementById("projImageUrl")) document.getElementById("projImageUrl").value = proj.imageUrl || "";
  if (document.getElementById("projDescription")) document.getElementById("projDescription").value = proj.description || "";
  document.getElementById("projMaxMembers").value = proj.maxMembers;
  
  const statusSelect = document.getElementById("projStatus");
  if (statusSelect) {
    statusSelect.value = proj.status || (proj.hidden === true || proj.hidden === "true" ? "hidden" : "open");
  }

  const roleContainer = document.getElementById("roleInputsContainer");
  roleContainer.innerHTML = "";
  if (proj.roles) proj.roles.forEach((r) => window.addRoleInput(r.name, r.count));

  const qContainer = document.getElementById("customQuestionsContainer");
  qContainer.innerHTML = "";
  if (proj.customQuestions) {
    proj.customQuestions.forEach((q) => window.addQuestionInput(q.title, q.type, q.options || []));
  }

  if (document.getElementById("stage2Description")) document.getElementById("stage2Description").value = proj.stage2Description || "";
  const s2Container = document.getElementById("stage2QuestionsContainer");
  s2Container.innerHTML = "";
  if (proj.stage2Questions && proj.stage2Questions.length > 0) {
    proj.stage2Questions.forEach((q) => window.addStage2QuestionInput(q.title, q.type, q.options || [], q.placeholder || ""));
  } else {
    window.addStage2QuestionInput();
  }

  if (typeof switchProjectTab === "function") switchProjectTab(1);
  document.getElementById("projectModal").classList.add("open");
};

window.deleteProject = async function (index) {
  if (!window.isAdminOwner) {
    alert("⚠️ เฉพาะผู้ใช้งานระดับ OWNER เท่านั้นที่มีสิทธิ์ลบโปรเจกต์!");
    return;
  }

  const proj = projects[index];
  const projName = proj ? proj.name : "";
  const step1 = confirm(`⚠️ [ยืนยันการลบครั้งที่ 1/2]\nคุณต้องการลบโปรเจกต์ "${projName}" ใช่หรือไม่?`);
  if (!step1) return;

  const step2Input = prompt(`🔴 [ยืนยันการลบครั้งที่ 2/2 - ความปลอดภัยสูงสุด]\nโปรดพิมพ์คำว่า "DELETE" เพื่อยืนยันการลบโปรเจกต์นี้ถาวร:`);
  if (step2Input !== "DELETE") {
    alert("❌ ยกเลิกการลบโปรเจกต์เนื่องจากคำยืนยันไม่ถูกต้อง");
    return;
  }

  try {
    await deleteDoc(doc(db, "projects", proj.firebaseId));
    await logAdminAction("ลบโปรเจกต์", `ลบโปรเจกต์ "${projName}" ออกจากระบบถาวร`, proj, null);
    alert("🗑️ ลบโปรเจกต์ออกจากระบบเรียบร้อยแล้ว");
  } catch (err) {
    alert("❌ ลบไม่สำเร็จ: " + err.message);
  }
};

window.viewApps = function (index) {
  currentProjectIndex = index;
  document.getElementById("appSearchInput").value = "";
  document.getElementById("appStatusFilter").value = "all";
  window.renderApplicationsList();
  document.getElementById("appModal").classList.add("open");
};

function extractApplicantChoices(app, proj) {
  let rawChoices = [];
  if (app.choices) {
    if (Array.isArray(app.choices)) rawChoices = rawChoices.concat(app.choices);
    else if (typeof app.choices === "string" && app.choices.trim() !== "") rawChoices.push(app.choices.trim());
  }
  if (app.answers) {
    if (Array.isArray(app.answers)) {
      app.answers.forEach((ans) => {
        if (ans && ans.value !== undefined) {
          if (Array.isArray(ans.value)) rawChoices = rawChoices.concat(ans.value);
          else if (typeof ans.value === "string" && ans.value.trim() !== "") {
            rawChoices = rawChoices.concat(ans.value.split(/[,,\n]+/).map(v => v.trim()).filter(v => v.length > 0));
          }
        }
      });
    } else if (typeof app.answers === "object") {
      for (const [q, a] of Object.entries(app.answers)) {
        if (typeof a === "string" && a.trim() !== "") {
          rawChoices = rawChoices.concat(a.split(/[,,\n]+/).map(v => v.trim()).filter(v => v.length > 0));
        } else if (Array.isArray(a)) rawChoices = rawChoices.concat(a);
      }
    }
  }
  if (app.selectedRole) rawChoices.push(app.selectedRole);
  if (app.role) rawChoices.push(app.role);

  if (!proj || !proj.roles || !Array.isArray(proj.roles)) return [];
  const matchedRoles = [];
  rawChoices.forEach((choice) => {
    if (typeof choice !== "string") return;
    const cleanChoice = choice.trim().toLowerCase();
    const targetRole = proj.roles.find(r => r.name.trim().toLowerCase() === cleanChoice);
    if (targetRole && !matchedRoles.includes(targetRole.name)) matchedRoles.push(targetRole.name);
  });
  return matchedRoles;
}

window.renderApplicationsList = function () {
  if (currentProjectIndex === null) return;
  const proj = projects[currentProjectIndex];
  const container = document.getElementById("appListContent");
  if (!container) return;
  
  container.innerHTML = `<h4>โปรเจกต์: ${proj.name} (ประวัติผู้สมัครทุกขั้นตอนตามลำดับ)</h4><br>`;
  if (!proj.applications || proj.applications.length === 0) {
    container.innerHTML += '<p style="color:#888;">ยังไม่มีประวัติผู้สมัครในระบบ</p>';
    return;
  }

  const searchTerm = document.getElementById("appSearchInput").value.toLowerCase().trim();
  const statusFilter = document.getElementById("appStatusFilter").value;

  const sortedApps = [...proj.applications].sort((a, b) => {
    const getTime = (val) => {
      if (!val) return 0;
      if (typeof val.toDate === 'function') return val.toDate().getTime();
      const parsed = new Date(val).getTime();
      return isNaN(parsed) ? 0 : parsed;
    };
    return getTime(b.createdAt) - getTime(a.createdAt);
  });

  sortedApps.forEach((app) => {
    const appStatus = app.status || "pending_application";
    if (statusFilter !== "all" && appStatus !== statusFilter) return;
    const userName = (app.user || "").toLowerCase();
    const userEmail = (app.accountEmail || "").toLowerCase();
    if (searchTerm && !userName.includes(searchTerm) && !userEmail.includes(searchTerm)) return;

    let applicantRealName = "";
    let round1Html = "";
    const userChoices = extractApplicantChoices(app, proj);

    if (app.answers) {
      if (Array.isArray(app.answers)) {
        app.answers.forEach((ans) => {
          let val = Array.isArray(ans.value) ? ans.value.join(", ") : (ans.value !== undefined ? ans.value : "-");
          if (((ans.title || "").toLowerCase().includes("ชื่อ") || (ans.title || "").toLowerCase().includes("name")) && !applicantRealName) applicantRealName = val;
          round1Html += `<p style="margin:4px 0; font-size:0.85rem; color:#ccc;">• <strong>${ans.title || "คำถาม"}:</strong> <span style="color:#fff;">${val}</span></p>`;
        });
      } else if (typeof app.answers === "object") {
        for (const [q, a] of Object.entries(app.answers)) {
          let val = Array.isArray(a) ? a.join(", ") : (a !== undefined && a !== null ? a : "-");
          if (((q || "").toLowerCase().includes("ชื่อ") || (q || "").toLowerCase().includes("name")) && !applicantRealName) applicantRealName = val;
          round1Html += `<p style="margin:4px 0; font-size:0.85rem; color:#ccc;">• <strong>${q}:</strong> <span style="color:#fff;">${val}</span></p>`;
        }
      }
    } else {
      round1Html = '<p style="color:#666; font-size:0.85rem;">ไม่มีข้อมูลคำตอบรอบที่ 1</p>';
    }

    let round2Html = '<p style="color:#666; font-size:0.85rem;">ยังไม่ได้ส่งข้อมูลรอบ 2</p>';
    if (app.stage2Answers && typeof app.stage2Answers === "object" && Object.keys(app.stage2Answers).length > 0) {
      round2Html = "";
      for (const [q, a] of Object.entries(app.stage2Answers)) {
        let displayVal = Array.isArray(a) ? a.join(", ") : (a !== undefined && a !== null ? a : "-");
        if (typeof displayVal === 'string' && (displayVal.startsWith('http://') || displayVal.startsWith('https://')) && (displayVal.match(/\.(jpeg|jpg|gif|png|webp)$/i) || displayVal.includes('imgur') || displayVal.includes('firebasestorage'))) {
          displayVal = `<br><a href="${displayVal}" target="_blank" style="color:#17a2b8; text-decoration:underline;">🔗 เปิดดูลิงก์รูปภาพ</a><br><img src="${displayVal}" style="max-width:100%; height:auto; border-radius:4px; margin-top:6px; border:1px solid #333;" onerror="this.style.display='none'"/>`;
        }
        round2Html += `<p style="margin:6px 0; font-size:0.85rem; color:#ccc; border-bottom:1px solid #222; padding-bottom:4px;">• <strong>${q}:</strong> <span style="color:#fff;">${displayVal}</span></p>`;
      }
    }

    let statusBadge = '<span class="badge-status status-pending">1. ยืนสมัคร</span>';
    if (appStatus === "step_1_1_interview" || appStatus === "interview") statusBadge = '<span class="badge-status status-interview">1.1 นัดสัมภาษณ์แล้ว</span>';
    if (appStatus === "step_1_2_passed" || appStatus === "passed") statusBadge = '<span class="badge-status status-passed">1.2 ผ่าน & ล็อคบทบาทแล้ว</span>';
    if (appStatus === "step_1_2_5_pending" || appStatus === "role_pending_review") statusBadge = `<span class="badge-status" style="background:#17a2b8; color:#fff;">⏳ 1.2.5 รออุทธรณ์ (${app.pendingAppealRole || "-"})</span>`;
    if (appStatus === "step_1_2_5_revision" || appStatus === "revision_requested") statusBadge = '<span class="badge-status" style="background:#f0ad4e; color:#000;">🔄 1.2.5 แจ้งเลือกบทบาทใหม่</span>';
    if (appStatus === "step_1_9_5_requested" || appStatus === "edit_requested") statusBadge = '<span class="badge-status" style="background:#f0ad4e; color:#000;">1.9.5 ขอแก้ไขรอบ 2</span>';
    if (appStatus === "step_1_9_5_allowed" || appStatus === "edit_allowed") statusBadge = '<span class="badge-status" style="background:#28a745; color:#fff;">🔓 1.9.5 อนุญาตให้แก้ไขแล้ว</span>';
    if (appStatus === "step_2_submitted" || appStatus === "stage2_submitted") statusBadge = '<span class="badge-status" style="background:#17a2b8; color:#fff;">2.1 ส่งเอกสารรอบ 2 แล้ว</span>';
    if (appStatus === "step_3_approved" || appStatus === "approved") statusBadge = `<span class="badge-status status-approved">3. เข้าโปรเจกต์แล้ว (${app.assignedRole || "สมาชิก"})</span>`;
    if (appStatus === "rejected") statusBadge = '<span class="badge-status status-rejected">❌ ไม่ผ่าน / ยกเลิก</span>';

    let choiceSummaryTag = userChoices.length > 0 ? `<div style="font-size:0.8rem; color:#f0ad4e; margin-top:2px;">⭐ ตัวเลือกบทบาท: ${userChoices.map((c, i) => `อันดับ ${i + 1}:${c}`).join(" | ")}</div>` : "";
    let lockedRoleTag = app.assignedRole ? `<div style="font-size:0.80rem; color:#28a745; font-weight:bold; margin-top:2px;">🔒 ล็อคบทบาท: ${app.assignedRole}</div>` : "";
    let realNameBadge = applicantRealName ? `<div style="font-size:0.85rem; color:#4a90e2; font-weight:bold; margin-top:2px;">🏷️ ชื่อจริง: ${applicantRealName}</div>` : "";

    let actionButtons = "";
    if (appStatus === "pending_application" || appStatus === "pending" || !appStatus) {
      actionButtons = `
        <button class="btn-secondary" style="background:#f0ad4e; color:#000;" onclick="openInterviewPrompt('${app.uid}')">📅 1. ตั้งวันสัมภาษณ์</button>
        <button class="btn-secondary" style="background:#c9302c;" onclick="updateAppStatusByUid('${app.uid}', 'rejected')">❌ ปฏิเสธ</button>
      `;
    } else if (appStatus === "step_1_1_interview" || appStatus === "interview") {
      actionButtons = `
        <button class="btn-secondary" style="background:#17a2b8;" onclick="openApplicationChoicesModalByUid('${app.uid}')">✅ 1.2 พิจารณาบทบาท</button>
        <button class="btn-secondary" style="background:#f0ad4e; color:#000;" onclick="openInterviewPrompt('${app.uid}')">📅 เปลี่ยนวันสัมภาษณ์</button>
        <button class="btn-secondary" style="background:#c9302c;" onclick="updateAppStatusByUid('${app.uid}', 'rejected')">❌ ปฏิเสธ</button>
      `;
    } else if (appStatus === "step_1_2_5_pending" || appStatus === "role_pending_review") {
      actionButtons = `
        <button class="btn-secondary" style="background:#28a745;" onclick="adminReviewRoleByUid('${app.uid}', 'approve')">✅ อนุมัติอุทธรณ์</button>
        <button class="btn-secondary" style="background:#c9302c;" onclick="adminReviewRoleByUid('${app.uid}', 'reject')">❌ ปฏิเสธอุทธรณ์</button>
      `;
    } else if (appStatus === "step_1_9_5_requested" || appStatus === "edit_requested") {
      actionButtons = `
        <button class="btn-secondary" style="background:#28a745;" onclick="approveEditRequestByUid('${app.uid}')">🔓 อนุมัติแก้เอกสาร</button>
        <button class="btn-secondary" style="background:#c9302c;" onclick="rejectEditRequestByUid('${app.uid}')">❌ ไม่อนุมัติแก้</button>
      `;
    } else if (appStatus === "step_2_submitted" || appStatus === "stage2_submitted") {
      actionButtons = `
        <button class="btn-secondary" style="background:#28a745;" onclick="updateAppStatusByUid('${app.uid}', 'step_3_approved')">🎯 ยืนยันเข้าสู่ขั้นตอน 3</button>
        <button class="btn-secondary" style="background:#f0ad4e; color:#000;" onclick="openRevisionPromptByUid('${app.uid}')">🔄 ตีกลับรอบ 2</button>
      `;
    }

    container.innerHTML += `
      <div class="app-item" style="background:#141414; border:1px solid #333; padding:12px; border-radius:6px; margin-bottom:10px;">
        <div><strong>👤 ${app.user || "ไม่ระบุชื่อ"}</strong> ${statusBadge}</div>
        ${realNameBadge} ${choiceSummaryTag} ${lockedRoleTag}
        <div style="font-size:0.8rem; color:#aaa; margin-top:4px; margin-bottom:6px;">📧 ${app.accountEmail || "-"} | สมัครเมื่อ: ${app.createdAtString || "-"}</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <div style="background:#1c1c1c; padding:10px; border-radius:4px;"><p style="color:#ff2a2a; font-size:0.8rem; font-weight:bold; margin:0 0 8px 0;">📋 รอบ 1:</p>${round1Html}</div>
          <div style="background:#1c1c1c; padding:10px; border-radius:4px;"><p style="color:#17a2b8; font-size:0.8rem; font-weight:bold; margin:0 0 8px 0;">📝 รอบ 2:</p>${round2Html}</div>
        </div>
        <div style="display:flex; gap:6px; margin-top:10px; flex-wrap:wrap;">${actionButtons}</div>
      </div>
    `;
  });
};

function checkRoleAvailability(proj, roleName) {
  if (!proj || !proj.roles) return { available: false, currentCount: 0, maxCount: 0 };
  const targetRole = proj.roles.find((r) => r.name.trim() === (roleName || "").trim());
  if (!targetRole) return { available: false, currentCount: 0, maxCount: 0 };

  const filledInRole = proj.applications ? proj.applications.filter((a) => a.assignedRole === targetRole.name && isCountedAsPassed(a.status)).length : 0;
  return { available: filledInRole < Number(targetRole.count), currentCount: filledInRole, maxCount: Number(targetRole.count) };
}

window.openApplicationChoicesModalByUid = function (targetUid) {
  const proj = projects[currentProjectIndex];
  const app = proj.applications.find(a => a.uid === targetUid);
  if (!app) return;

  const choices = extractApplicantChoices(app, proj);
  let choicesHtml = "";

  if (choices.length === 0) {
    choicesHtml = `<p style="color:#17a2b8;">ผู้สมัครไม่ได้ระบุอันดับบทบาทไว้</p>`;
  } else {
    choices.forEach((choiceRole, idx) => {
      const rankNumber = idx + 1;
      const roleCheck = checkRoleAvailability(proj, choiceRole);
      let statusColor = roleCheck.available ? "#28a745" : "#ff2a2a";
      let statusText = roleCheck.available ? `🟢 ว่าง (${roleCheck.currentCount}/${roleCheck.maxCount})` : `🔴 เต็มแล้ว (${roleCheck.currentCount}/${roleCheck.maxCount})`;
      let actionHtml = roleCheck.available ? `<button class="btn-secondary" style="background:#28a745; padding:6px 12px;" onclick="approveAppWithChoiceByUid('${targetUid}', '${choiceRole}', ${rankNumber})">✅ ล็อคบทบาทนี้ (อันดับ ${rankNumber})</button>` : "";

      choicesHtml += `
        <div style="background:#1c1c1c; padding:12px; border-radius:6px; margin-bottom:10px; border-left:5px solid ${statusColor};">
          <strong>อันดับที่ ${rankNumber}: ${choiceRole}</strong> <span style="color:${statusColor}; font-size:0.85rem;">${statusText}</span><br><div style="margin-top:6px;">${actionHtml}</div>
        </div>
      `;
    });
  }

  let modal = document.getElementById("appChoicesModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "appChoicesModal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 99999; display: flex; align-items: center; justify-content: center;";
    modal.innerHTML = `<div class="modal-content" style="background:#181818; border:1px solid #333; max-width:550px; width:90%; padding:20px; border-radius:8px; color:#fff;"><div id="appChoicesContent"></div><div style="text-align:right; margin-top:15px;"><button class="btn-secondary" style="background:#444;" onclick="document.getElementById('appChoicesModal').style.display='none'">ปิด</button></div></div>`;
    document.body.appendChild(modal);
  }

  document.getElementById("appChoicesContent").innerHTML = `
    <h4 style="margin-top:0;">พิจารณาบทบาท: <span style="color:#f0ad4e;">${app.user}</span></h4>
    ${choicesHtml}
    <hr style="border-color:#333; margin:15px 0;">
    <div style="display:flex; justify-content:space-between; gap:8px;">
      <button class="btn-secondary" style="background:#f0ad4e; color:#000;" onclick="requestNewChoicesByUid('${targetUid}')">🔄 ส่งไปอุทธรณ์ 1.2.5</button>
      <button class="btn-secondary" style="background:#c9302c; font-weight:bold;" onclick="rejectApplicationCompletelyByUid('${targetUid}')">❌ ปฏิเสธการสมัคร</button>
    </div>
  `;
  modal.style.display = "flex";
};

window.approveAppWithChoiceByUid = async function (targetUid, chosenRole, rankNumber) {
  if (!confirm(`ยืนยันล็อคบทบาท "${chosenRole}"?`)) return;
  const proj = projects[currentProjectIndex];
  const targetAppBefore = proj && proj.applications ? proj.applications.find(a => a.uid === targetUid) : null;
  const targetAppAfter = targetAppBefore ? { ...targetAppBefore, status: "step_1_2_passed", assignedRole: chosenRole, approvedRank: rankNumber } : null;

  await updateAppStatusWithDataByUid(targetUid, "step_1_2_passed", { assignedRole: chosenRole, approvedRank: rankNumber });
  document.getElementById("appChoicesModal").style.display = "none";
  
  await logAdminAction(
    "ยืนยันผล / ล็อคบทบาท", 
    `ล็อคบทบาท "${chosenRole}" ให้กับผู้สมัคร (${targetAppBefore?.user || targetUid}) ในโปรเจกต์ ${proj?.name || ""}`,
    targetAppBefore,
    targetAppAfter
  );
  alert("✅ ล็อคบทบาทสำเร็จ!");
};

window.requestNewChoicesByUid = async function (targetUid) {
  const note = prompt("ระบุหมายเหตุแจ้งเตือนให้ผู้ใช้ไปอุทธรณ์:");
  if (note !== null) {
    const proj = projects[currentProjectIndex];
    const targetAppBefore = proj && proj.applications ? proj.applications.find(a => a.uid === targetUid) : null;
    const targetAppAfter = targetAppBefore ? { ...targetAppBefore, status: "step_1_2_5_revision", revisionNote: note || "กรุณายื่นอุทธรณ์เลือกบทบาทใหม่" } : null;

    await updateAppStatusWithDataByUid(targetUid, "step_1_2_5_revision", { revisionNote: note || "กรุณายื่นอุทธรณ์เลือกบทบาทใหม่" });
    document.getElementById("appChoicesModal").style.display = "none";
    
    await logAdminAction(
      "แจ้งอุทธรณ์บทบาท", 
      `ส่งเรื่องให้ผู้สมัคร (${targetAppBefore?.user || targetUid}) เลือกบทบาทใหม่ในโปรเจกต์ ${proj?.name || ""}`,
      targetAppBefore,
      targetAppAfter
    );
    alert("✅ ส่งคำขอเรียบร้อย!");
  }
};

window.adminReviewRoleByUid = async function (targetUid, actionType) {
  const proj = projects[currentProjectIndex];
  const targetAppBefore = proj && proj.applications ? proj.applications.find(a => a.uid === targetUid) : null;
  
  try {
    let targetAppAfter = null;
    await runTransaction(db, async (transaction) => {
      const projRef = doc(db, "projects", proj.firebaseId);
      const projDoc = await transaction.get(projRef);
      const apps = projDoc.data().applications || [];
      const appIndex = apps.findIndex(a => a.uid === targetUid);
      if (actionType === "approve") {
        apps[appIndex].assignedRole = apps[appIndex].pendingAppealRole || apps[appIndex].selectedNewRole;
        apps[appIndex].status = "step_1_2_passed";
        delete apps[appIndex].pendingAppealRole;
      } else {
        apps[appIndex].status = "step_1_2_5_revision";
      }
      targetAppAfter = apps[appIndex];
      transaction.update(projRef, { applications: apps });
    });
    window.renderApplicationsList();
    
    await logAdminAction(
      "พิจารณาอุทธรณ์บทบาท", 
      `ผลการตรวจสอบอุทธรณ์ (${actionType}) ของผู้สมัคร (${targetAppBefore?.user || targetUid}) ในโปรเจกต์ ${proj.name}`,
      targetAppBefore,
      targetAppAfter
    );
    alert("✅ ดำเนินการสำเร็จ!");
  } catch (err) { alert("เกิดข้อผิดพลาด: " + err.message); }
};

window.approveEditRequestByUid = async function (targetUid) {
  const proj = projects[currentProjectIndex];
  const targetAppBefore = proj && proj.applications ? proj.applications.find(a => a.uid === targetUid) : null;
  const targetAppAfter = targetAppBefore ? { ...targetAppBefore, status: "step_1_9_5_allowed", revisionNote: "อนุมัติให้แก้ไขเอกสารรอบ 2" } : null;

  await updateAppStatusWithDataByUid(targetUid, "step_1_9_5_allowed", { revisionNote: "อนุมัติให้แก้ไขเอกสารรอบ 2" });
  
  await logAdminAction(
    "อนุมัติแก้ไขเอกสาร", 
    `อนุมัติให้ผู้สมัคร (${targetAppBefore?.user || targetUid}) แก้ไขเอกสารรอบ 2 ในโปรเจกต์ ${proj?.name || ""}`,
    targetAppBefore,
    targetAppAfter
  );
  alert("✅ อนุมัติเรียบร้อย!");
};

window.rejectEditRequestByUid = async function (targetUid) {
  const note = prompt("ระบุเหตุผล:");
  if (note !== null) {
    const proj = projects[currentProjectIndex];
    const targetAppBefore = proj && proj.applications ? proj.applications.find(a => a.uid === targetUid) : null;
    const targetAppAfter = targetAppBefore ? { ...targetAppBefore, status: "step_2_submitted", revisionNote: `ไม่อนุมัติ: ${note}` } : null;

    await updateAppStatusWithDataByUid(targetUid, "step_2_submitted", { revisionNote: `ไม่อนุมัติ: ${note}` });
    
    await logAdminAction(
      "ปฏิเสธคำขอแก้ไขเอกสาร", 
      `ไม่อนุมัติแก้ไขเอกสารของผู้สมัคร (${targetAppBefore?.user || targetUid}): ${note}`,
      targetAppBefore,
      targetAppAfter
    );
  }
};

window.openRevisionPromptByUid = function (targetUid) {
  const note = prompt("ระบุจุดที่ต้องแก้ไขในรอบ 2:");
  if (note !== null) {
    const proj = projects[currentProjectIndex];
    const targetAppBefore = proj && proj.applications ? proj.applications.find(a => a.uid === targetUid) : null;
    const targetAppAfter = targetAppBefore ? { ...targetAppBefore, status: "step_1_2_passed", revisionNote: note, stage2Answers: null } : null;

    updateAppStatusWithDataByUid(targetUid, "step_1_2_passed", { revisionNote: note, stage2Answers: null });
    
    logAdminAction(
      "ตีกลับเอกสารรอบ 2", 
      `ตีกลับให้ผู้สมัคร (${targetAppBefore?.user || targetUid}) แก้ไข: ${note}`,
      targetAppBefore,
      targetAppAfter
    );
  }
};

window.rejectApplicationCompletelyByUid = async function (targetUid) {
  if (confirm("⚠️ ต้องการปฏิเสธการสมัครของผู้สมัครรายนี้?")) {
    const proj = projects[currentProjectIndex];
    const targetAppBefore = proj && proj.applications ? proj.applications.find(a => a.uid === targetUid) : null;
    const targetAppAfter = targetAppBefore ? { ...targetAppBefore, status: "rejected", approvalNote: "ปฏิเสธการสมัครเนื่องจากไม่ผ่านเกณฑ์" } : null;

    await updateAppStatusWithDataByUid(targetUid, "rejected", {
      approvalNote: "ปฏิเสธการสมัครเนื่องจากไม่ผ่านเกณฑ์",
    });
    const modal = document.getElementById("appChoicesModal");
    if (modal) modal.style.display = "none";
    
    await logAdminAction(
      "ปฏิเสธการสมัคร", 
      `ปฏิเสธผู้สมัคร (${targetAppBefore?.user || targetUid}) ออกจากโปรเจกต์ ${proj?.name || ""}`,
      targetAppBefore,
      targetAppAfter
    );
    alert("❌ ปฏิเสธการสมัครเรียบร้อย");
  }
};

// ================= ปรับปรุงส่วนปฏิทินเลือกวันสัมภาษณ์ (บล็อกการพิมพ์ และบังคับเปิดปฏิทิน) =================
window.openInterviewPrompt = function (targetUid) {
  selectedAppIndexForInterview = targetUid;
  
  let modal = document.getElementById("interviewModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "interviewModal";
    modal.className = "modal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 100000; display: flex; align-items: center; justify-content: center;";
    modal.innerHTML = `
      <div style="background:#18181e; border:1px solid #333; max-width:400px; width:90%; padding:24px; border-radius:8px; color:#fff; box-sizing: border-box;">
        <h3 style="margin-top:0; color:#17a2b8; margin-bottom:12px;">📅 กำหนดวันและเวลาสัมภาษณ์</h3>
        <p style="font-size:0.85rem; color:#aaa; margin-bottom:15px;">กรุณาเลือกวันและเวลาที่ต้องการนัดหมายผู้สมัครผ่านปฏิทินระบบ</p>
        
        <div style="margin-bottom:20px;">
          <label style="display:block; font-size:0.85rem; color:#ccc; margin-bottom:6px;">เลือกวันและเวลา:</label>
          <input 
            type="datetime-local" 
            id="interviewDatetimeInput" 
            onkeydown="return false;" 
            onpointerdown="try{this.showPicker()}catch(e){}"
            onclick="try{this.showPicker()}catch(e){}"
            onfocus="try{this.showPicker()}catch(e){}"
            style="width:100%; padding:10px; background:#111; border:1px solid #444; color:#fff; border-radius:4px; box-sizing:border-box; font-size:0.95rem; cursor:pointer;" 
          />
        </div>
        
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="button" class="btn-secondary" style="background:#444; color:#fff; padding:8px 16px; border-radius:4px; cursor:pointer;" onclick="closeInterviewModal()">ยกเลิก</button>
          <button type="button" class="btn-secondary" style="background:#28a745; color:#fff; font-weight:bold; padding:8px 16px; border-radius:4px; cursor:pointer;" onclick="confirmInterviewSchedule()">💾 ยืนยันการนัดหมาย</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const dtInput = document.getElementById("interviewDatetimeInput");
  if (dtInput) dtInput.value = "";

  modal.classList.add("open");
  modal.style.display = "flex";
};

window.closeInterviewModal = function () {
  const modal = document.getElementById("interviewModal");
  if (modal) {
    modal.classList.remove("open");
    modal.style.display = "none";
  }
  selectedAppIndexForInterview = null;
};

window.confirmInterviewSchedule = async function () {
  const dtInput = document.getElementById("interviewDatetimeInput").value;
  if (!dtInput) {
    alert("⚠️ กรุณาเลือกวันและเวลานัดหมายสัมภาษณ์");
    return;
  }

  const [datePart, timePart] = dtInput.split("T");
  const [y, m, d] = datePart.split("-");
  const formattedDateTime = `${d}/${m}/${y} เวลา ${timePart} น.`;

  if (selectedAppIndexForInterview !== null) {
    const proj = projects[currentProjectIndex];
    const targetAppBefore = proj && proj.applications ? proj.applications.find(a => a.uid === selectedAppIndexForInterview) : null;
    const targetAppAfter = targetAppBefore ? { ...targetAppBefore, status: "step_1_1_interview", interviewDate: formattedDateTime } : null;

    await updateAppStatusWithDataByUid(selectedAppIndexForInterview, "step_1_1_interview", { interviewDate: formattedDateTime });
    
    await logAdminAction(
      "นัดหมายสัมภาษณ์", 
      `กำหนดวันสัมภาษณ์ผู้สมัคร (${targetAppBefore?.user || selectedAppIndexForInterview}) เป็นวันที่ ${formattedDateTime}`,
      targetAppBefore,
      targetAppAfter
    );

    window.closeInterviewModal();
    alert("✅ บันทึกวันนัดหมายสัมภาษณ์สำเร็จ!");
  }
};
// =================================================================================

window.updateAppStatusByUid = async function (targetUid, newStatus) {
  const proj = projects[currentProjectIndex];
  const targetAppBefore = proj && proj.applications ? proj.applications.find(a => a.uid === targetUid) : null;
  const targetAppAfter = targetAppBefore ? { ...targetAppBefore, status: newStatus } : null;

  await updateAppStatusWithDataByUid(targetUid, newStatus, {});
  
  await logAdminAction(
    "เปลี่ยนสถานะผู้สมัคร", 
    `อัปเดตสถานะผู้สมัคร (${targetAppBefore?.user || targetUid}) เป็น "${newStatus}"`,
    targetAppBefore,
    targetAppAfter
  );
};

async function updateAppStatusWithDataByUid(targetUid, newStatus, additionalData) {
  const proj = projects[currentProjectIndex];
  const currentDateTime = new Date().toLocaleString("th-TH");
  try {
    await runTransaction(db, async (transaction) => {
      const projRef = doc(db, "projects", proj.firebaseId);
      const projDoc = await transaction.get(projRef);
      const apps = projDoc.data().applications || [];
      const appIndex = apps.findIndex(a => a.uid === targetUid);
      apps[appIndex] = { ...apps[appIndex], status: newStatus, ...additionalData, updatedAtString: currentDateTime };
      transaction.update(projRef, { applications: apps });
    });
    window.renderApplicationsList();
  } catch (err) { alert("❌ เกิดข้อผิดพลาด: " + err.message); }
}

window.closeAppModal = function () { document.getElementById("appModal").classList.remove("open"); };

window.openProjectWindow3 = function (index) {
  currentProjectIndexForWindow3 = index;
  const proj = projects[index];
  
  const titleElem = document.getElementById("w3ProjTitle");
  if (titleElem) titleElem.innerText = `บอร์ดโปรเจกต์ (3): ${proj.name}`;
  
  const titleInput = document.getElementById("pNewsTitle");
  const contentInput = document.getElementById("pNewsContent");
  const imgInput = document.getElementById("pNewsImageUrl");
  if (titleInput) titleInput.value = "";
  if (contentInput) contentInput.value = "";
  if (imgInput) imgInput.value = "";
  
  const searchInput = document.getElementById("projectMemberSearchInput");
  if (searchInput) searchInput.value = "";

  if (typeof window.switchW3Tab === 'function') {
    window.switchW3Tab('news');
  }

  renderProjectNewsList();
  document.getElementById("projectWindow3Modal").classList.add("open");
};

window.closeProjectWindow3 = function () { 
  document.getElementById("projectWindow3Modal").classList.remove("open"); 
  currentProjectIndexForWindow3 = null;
};

window.openSubServerStatusConfigModal = function() {
  if (currentProjectIndexForWindow3 === null || currentProjectIndexForWindow3 === undefined) return;
  const proj = projects[currentProjectIndexForWindow3];
  if (!proj) return;
  
  if (!proj.subServerStatuses || !Array.isArray(proj.subServerStatuses)) {
    proj.subServerStatuses = [
      { name: "ว่าง", color: "#28a745" },
      { name: "ไม่ว่าง", color: "#c9302c" }
    ];
  }

  let modal = document.getElementById("subServerConfigModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "subServerConfigModal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 100000; display: flex; align-items: center; justify-content: center;";
    modal.innerHTML = `
      <div style="background:#1e1e24; border:1px solid #333; max-width:500px; width:90%; padding:24px; border-radius:8px; color:#fff;">
        <h3 style="margin-top:0; color:#17a2b8;">⚙️ ตั้งค่าสถานะและสีลูกเซิร์ฟ</h3>
        <p style="font-size:0.85rem; color:#aaa; margin-bottom:12px;">คุณสามารถแก้ไขชื่อหรือลบสถานะมาตรฐาน (ว่าง/ไม่ว่าง) ได้อย่างอิสระ</p>
        <form onsubmit="handleSaveSubServerStatusConfig(event)">
          <div id="subServerStatusInputsContainer" style="display:flex; flex-direction:column; gap:8px; margin-bottom:15px; max-height:280px; overflow-y:auto; padding-right:4px;"></div>
          <button type="button" class="btn-secondary" style="background:transparent; color:#17a2b8; border:1px dashed #17a2b8; width:100%; padding:8px; margin-bottom:15px; cursor:pointer;" onclick="addSubServerStatusInputRow('', '#17a2b8')">➕ เพิ่มสถานะใหม่</button>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="btn-secondary" style="background:#444;" onclick="document.getElementById('subServerConfigModal').style.display='none'">ยกเลิก</button>
            <button type="submit" class="btn-secondary" style="background:#28a745; font-weight:bold; cursor:pointer;">💾 บันทึกสถานะทั้งหมด</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const container = document.getElementById("subServerStatusInputsContainer");
  if (container) {
    container.innerHTML = "";
    proj.subServerStatuses.forEach(st => {
      const stName = typeof st === 'string' ? st : st.name;
      const stColor = typeof st === 'string' ? (stName === "ว่าง" ? "#28a745" : "#c9302c") : (st.color || "#17a2b8");
      addSubServerStatusInputRow(stName, stColor);
    });
  }

  modal.style.display = "flex";
};

window.addSubServerStatusInputRow = function(val = "", color = "#17a2b8") {
  const container = document.getElementById("subServerStatusInputsContainer");
  if (!container) return;
  
  const div = document.createElement("div");
  div.className = "sub-status-config-row";
  div.style.cssText = "display:flex; gap:8px; align-items:center; background:#141419; padding:8px; border-radius:6px; border:1px solid #2a2a35;";
  div.innerHTML = `
    <input type="color" class="sub-status-color-input" value="${color}" style="width:36px; height:36px; border:none; background:none; cursor:pointer; border-radius:4px;" title="เลือกสีสถานะ" />
    <input type="text" class="sub-status-name-input" value="${val}" required placeholder="ชื่อสถานะลูกเซิร์ฟ" style="flex:1; padding:8px; background:#181820; border:1px solid #444; color:#fff; border-radius:4px;" />
    <button type="button" onclick="this.closest('.sub-status-config-row').remove()" style="background:#c9302c; color:#fff; border:none; padding:8px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">🗑️ ลบ</button>
  `;
  container.appendChild(div);
};

window.handleSaveSubServerStatusConfig = async function(e) {
  e.preventDefault();
  if (currentProjectIndexForWindow3 === null || currentProjectIndexForWindow3 === undefined) return;
  const proj = projects[currentProjectIndexForWindow3];
  if (!proj) return;

  const oldStatuses = proj.subServerStatuses || [];
  const rows = document.querySelectorAll(".sub-status-config-row");
  let newStatuses = [];
  let existingNames = new Set();

  rows.forEach(row => {
    const nameInput = row.querySelector(".sub-status-name-input");
    const colorInput = row.querySelector(".sub-status-color-input");
    if (nameInput) {
      const name = nameInput.value.trim();
      const color = colorInput ? colorInput.value : "#17a2b8";
      if (name && !existingNames.has(name)) {
        existingNames.add(name);
        newStatuses.push({ name, color });
      }
    }
  });

  proj.subServerStatuses = newStatuses;
  const currentDateTime = new Date().toLocaleString("th-TH");

  try {
    await updateDoc(doc(db, "projects", proj.firebaseId), {
      subServerStatuses: newStatuses,
      updatedAt: serverTimestamp(),
      updatedAtString: currentDateTime,
    });
    
    await logAdminAction(
      "ตั้งค่าสถานะลูกเซิร์ฟ", 
      `อัปเดตรายการสถานะลูกเซิร์ฟในโปรเจกต์ "${proj.name}"`,
      { subServerStatuses: oldStatuses },
      { subServerStatuses: newStatuses }
    );

    const modal = document.getElementById("subServerConfigModal");
    if (modal) modal.style.display = "none";
    renderCombinedMemberList();
    alert("✅ บันทึกการตั้งค่าสถานะลูกเซิร์ฟสำเร็จ!");
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
};

window.renderCombinedMemberList = function() {
  if (currentProjectIndexForWindow3 === null || currentProjectIndexForWindow3 === undefined) return;
  const proj = projects[currentProjectIndexForWindow3];
  if (!proj) return;
  
  const container = document.getElementById("combinedMembersListContainer");
  if (!container) return;
  container.innerHTML = "";

  if (!proj.subServerStatuses || !Array.isArray(proj.subServerStatuses)) {
    proj.subServerStatuses = [
      { name: "ว่าง", color: "#28a745" },
      { name: "ไม่ว่าง", color: "#c9302c" }
    ];
  }

  const isOwner = window.isAdminOwner === true;

  const searchInputElem = document.getElementById("projectMemberSearchInput");
  const keyword = searchInputElem ? searchInputElem.value.toLowerCase().trim() : "";

  const members = proj.applications ? proj.applications.filter((a) => isCountedAsPassed(a.status)) : [];

  const filteredMembers = members.filter(m => {
    const name = (m.user || "").toLowerCase();
    const email = (m.accountEmail || "").toLowerCase();
    const role = (m.assignedRole || "").toLowerCase();
    return name.includes(keyword) || email.includes(keyword) || role.includes(keyword);
  });

  if (filteredMembers.length === 0) {
    container.innerHTML = '<p style="color:#888; text-align:center; padding: 20px;">ไม่พบรายชื่อสมาชิกที่ค้นหา</p>';
    return;
  }

  filteredMembers.forEach((m) => {
    const currentSubStatus = m.subServerStatus || (proj.subServerStatuses[0] ? (typeof proj.subServerStatuses[0] === 'object' ? proj.subServerStatuses[0].name : proj.subServerStatuses[0]) : "ว่าง");
    
    let currentStatusObj = proj.subServerStatuses.find(st => (typeof st === 'object' ? st.name : st) === currentSubStatus);
    let selectBg = currentStatusObj && typeof currentStatusObj === 'object' ? currentStatusObj.color : "#28a745";

    let optionsHtml = "";
    proj.subServerStatuses.forEach(st => {
      const stName = typeof st === 'object' ? st.name : st;
      const isSelected = (currentSubStatus === stName) ? "selected" : "";
      optionsHtml += `<option value="${stName}" ${isSelected}>สถานะ: ${stName}</option>`;
    });

    let removeMemberButtonHtml = isOwner ? `
      <button class="btn-secondary" style="background:#c9302c; padding:6px 12px; font-size:0.8rem; border-radius: 4px; cursor: pointer; font-weight:bold;" onclick="removeMemberFromProjectByUid('${m.uid}')">🗑️ ปลดออก</button>
    ` : "";

    container.innerHTML += `
      <div style="background:#141414; padding:12px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; border:1px solid #282828; margin-bottom:6px; flex-wrap:wrap; gap:10px;">
        <div>
          <strong style="color:#fff; font-size:0.9rem;">👤 ${m.user || "ไม่ระบุชื่อ"}</strong>
          <span style="color:#28a745; font-size:0.75rem; background:rgba(40,167,69,0.15); padding:2px 6px; border-radius:4px; margin-left:6px;">(${m.assignedRole || "สมาชิก"})</span>
          <div style="font-size:0.75rem; color:#aaa; margin-top: 3px;">📧 ${m.accountEmail || "-"} | สถานะลูกเซิร์ฟปัจจุบัน: <strong style="color:${selectBg};">${currentSubStatus}</strong></div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <select 
            id="status-select-${m.uid}"
            style="background:${selectBg}; color:#fff; padding:6px 12px; font-size:0.82rem; border:1px solid #444; border-radius:4px; cursor:pointer; font-weight:bold; outline:none;" 
            onchange="updateMemberSubServerStatus('${m.uid}', this.value)"
          >
            ${optionsHtml}
          </select>
          ${removeMemberButtonHtml}
        </div>
      </div>
    `;
  });
};

window.renderProjectMembersList = function() {
  renderCombinedMemberList();
};

window.updateMemberSubServerStatus = async function(targetUid, newStatus) {
  if (currentProjectIndexForWindow3 === null || currentProjectIndexForWindow3 === undefined) return;
  const proj = projects[currentProjectIndexForWindow3];
  if (!proj) return;
  const currentDateTime = new Date().toLocaleString("th-TH");

  let statusObj = proj.subServerStatuses.find(st => (typeof st === 'object' ? st.name : st) === newStatus);
  let newColor = statusObj && typeof statusObj === 'object' ? statusObj.color : "#17a2b8";
  const selectElem = document.getElementById(`status-select-${targetUid}`);
  if (selectElem) selectElem.style.background = newColor;

  try {
    let targetMemberName = targetUid;
    let oldSubStatus = "";
    await runTransaction(db, async (transaction) => {
      const projRef = doc(db, "projects", proj.firebaseId);
      const projDoc = await transaction.get(projRef);
      if (!projDoc.exists()) throw new Error("ไม่พบโปรเจกต์นี้");

      const projData = projDoc.data();
      const apps = projData.applications || [];
      const appIndex = apps.findIndex(a => a.uid === targetUid);
      if (appIndex === -1) throw new Error("ไม่พบสมาชิกรายนี้");

      targetMemberName = apps[appIndex].user || targetUid;
      oldSubStatus = apps[appIndex].subServerStatus || "ว่าง";
      apps[appIndex].subServerStatus = newStatus;
      apps[appIndex].updatedAtString = currentDateTime;

      transaction.update(projRef, {
        applications: apps,
        updatedAt: serverTimestamp(),
        updatedAtString: currentDateTime,
      });
    });

    await logAdminAction(
      "เปลี่ยนสถานะลูกเซิร์ฟ", 
      `เปลี่ยนสถานะลูกเซิร์ฟของ "${targetMemberName}" จาก "${oldSubStatus}" เป็น "${newStatus}" ในโปรเจกต์ ${proj.name}`,
      { subServerStatus: oldSubStatus },
      { subServerStatus: newStatus }
    );
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
    renderCombinedMemberList();
  }
};

window.removeMemberFromProjectByUid = async function (targetUid) {
  if (!window.isAdminOwner) {
    alert("⚠️ เฉพาะผู้ใช้งานระดับ OWNER เท่านั้นที่มีสิทธิ์ปลดสมาชิกออกจากโปรเจกต์!");
    return;
  }

  const step1 = confirm("⚠️ [ยืนยันการปลดครั้งที่ 1/2]\nคุณต้องการปลดสมาชิกออกจากโปรเจกต์และคืนโควตาใช่หรือไม่?");
  if (!step1) return;

  const step2Input = prompt("🔴 [ยืนยันการปลดครั้งที่ 2/2]\nพิมพ์คำว่า \"REMOVE\" เพื่อยืนยันการปลดสมาชิกรายนี้:");
  if (step2Input !== "REMOVE") {
    alert("❌ ยกเลิกการปลดสมาชิกเนื่องจากคำยืนยันไม่ถูกต้อง");
    return;
  }

  if (currentProjectIndexForWindow3 === null || currentProjectIndexForWindow3 === undefined) return;
  const proj = projects[currentProjectIndexForWindow3];
  if (!proj) return;
  const currentDateTime = new Date().toLocaleString("th-TH");

  try {
    let targetMemberName = targetUid;
    let memberDataBefore = null;
    await runTransaction(db, async (transaction) => {
      const projRef = doc(db, "projects", proj.firebaseId);
      const projDoc = await transaction.get(projRef);
      if (!projDoc.exists()) throw new Error("ไม่พบโปรเจกต์นี้");

      const projData = projDoc.data();
      const apps = projData.applications || [];
      const appIndex = apps.findIndex(a => a.uid === targetUid);
      if (appIndex === -1) throw new Error("ไม่พบสมาชิกรายนี้");

      targetMemberName = apps[appIndex].user || targetUid;
      memberDataBefore = apps[appIndex];
      apps[appIndex].status = "rejected";
      apps[appIndex].updatedAtString = currentDateTime;

      transaction.update(projRef, {
        applications: apps,
        updatedAt: serverTimestamp(),
        updatedAtString: currentDateTime,
      });
    });

    await logAdminAction(
      "ปลดสมาชิกออกจากโปรเจกต์", 
      `ปลดสมาชิก "${targetMemberName}" ออกจากโปรเจกต์ ${proj.name}`,
      memberDataBefore,
      memberDataBefore ? { ...memberDataBefore, status: "rejected" } : null
    );
    renderCombinedMemberList();
    alert("✅ ปลดสมาชิกสำเร็จ!");
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
};

function renderProjectNewsList() {
  if (currentProjectIndexForWindow3 === null || currentProjectIndexForWindow3 === undefined) return;
  const proj = projects[currentProjectIndexForWindow3];
  if (!proj) return;
  
  const container = document.getElementById("projectNewsListContainer");
  if (!container) return;
  container.innerHTML = "";
  const pNews = proj.projectNews || [];

  if (pNews.length === 0) {
    container.innerHTML = '<p style="color:#6b7280; font-size:0.85rem; text-align:center; padding: 25px; font-style: italic;">ยังไม่มีประกาศในโปรเจกต์นี้</p>';
    return;
  }

  pNews.forEach((n, nIdx) => {
    container.innerHTML += `
      <div style="background: #15151c; padding: 12px 14px; border-radius: 6px; border: 1px solid #262636; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="overflow: hidden; max-width: 60%;">
          <strong style="color: #fff; font-size: 0.9rem; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">📌 ${n.title}</strong>
          <span style="font-size: 0.75rem; color: #9ca3af;">🕒 ${n.date || "-"}</span>
        </div>
        <div style="display: flex; gap: 6px;">
          <button type="button" class="btn-secondary" style="background: #17a2b8; color: #fff; border: none; padding: 5px 10px; font-size: 0.78rem; border-radius: 4px; cursor: pointer;" onclick="openNewsDetailModal(${nIdx})">🔍 ดู / ✏️ แก้ไข</button>
          <button type="button" class="btn-secondary" style="background: #c9302c; color: #fff; border: none; padding: 5px 10px; font-size: 0.78rem; border-radius: 4px; cursor: pointer;" onclick="deleteProjectNews(${nIdx})">🗑️ ลบ</button>
        </div>
      </div>
    `;
  });
}

window.openNewsDetailModal = function(newsIdx) {
  if (currentProjectIndexForWindow3 === null || currentProjectIndexForWindow3 === undefined) return;
  const proj = projects[currentProjectIndexForWindow3];
  if (!proj || !proj.projectNews) return;
  const newsItem = proj.projectNews[newsIdx];
  if (!newsItem) return;

  let modal = document.getElementById("projectNewsDetailModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "projectNewsDetailModal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 100000; display: flex; align-items: center; justify-content: center;";
    modal.innerHTML = `
      <div class="modal-card" style="max-width: 600px; width: 90%; background: #18181e; border: 1px solid #333; padding: 24px; border-radius: 8px; color: #fff; max-height: 85vh; overflow-y: auto; box-sizing: border-box;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 10px;">
          <h3 style="color: #ff2a2a; margin: 0;">📜 รายละเอียดประกาศ</h3>
          <button type="button" onclick="document.getElementById('projectNewsDetailModal').style.display='none'" style="background: transparent; color: #aaa; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
        </div>
        <div id="newsDetailModalBody"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  let imageHtml = "";
  if (newsItem.imageUrl && newsItem.imageUrl.trim() !== "") {
    imageHtml = `<div style="margin-top: 12px;"><img src="${newsItem.imageUrl}" alt="News Image" style="max-width: 100%; max-height: 250px; border-radius: 6px; border: 1px solid #333; object-fit: cover;" onerror="this.style.display='none'"/></div>`;
  }

  document.getElementById("newsDetailModalBody").innerHTML = `
    <div id="newsViewMode">
      <div style="margin-bottom: 10px;">
        <span style="font-size: 0.78rem; color: #9ca3af; background: #222; padding: 3px 8px; border-radius: 4px;">📅 ${newsItem.date || "-"}</span>
      </div>
      <h4 style="color: #fff; font-size: 1.1rem; margin-top: 0; margin-bottom: 10px;">📌 ${newsItem.title}</h4>
      <p style="color: #d1d5db; white-space: pre-line; line-height: 1.6; font-size: 0.92rem; background: #141419; padding: 12px; border-radius: 6px; border: 1px solid #2a2a35;">${newsItem.content}</p>
      ${imageHtml}
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
        <button type="button" class="btn-secondary" style="background: #f0ad4e; color: #000; font-weight: bold; padding: 8px 16px; border-radius: 4px; cursor: pointer;" onclick="switchToEditNewsMode(${newsIdx})">✏️ แก้ไขประกาศนี้</button>
        <button type="button" class="btn-secondary" style="background: #444; color: #fff; padding: 8px 16px; border-radius: 4px; cursor: pointer;" onclick="document.getElementById('projectNewsDetailModal').style.display='none'">ปิด</button>
      </div>
    </div>
  `;

  modal.style.display = "flex";
};

window.switchToEditNewsMode = function(newsIdx) {
  if (currentProjectIndexForWindow3 === null || currentProjectIndexForWindow3 === undefined) return;
  const proj = projects[currentProjectIndexForWindow3];
  if (!proj || !proj.projectNews) return;
  const newsItem = proj.projectNews[newsIdx];
  if (!newsItem) return;

  document.getElementById("newsDetailModalBody").innerHTML = `
    <form onsubmit="saveEditedProjectNews(event, ${newsIdx})">
      <div class="form-group" style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 6px; font-size: 0.85rem; color: #ccc;">หัวข้อประกาศ</label>
        <input type="text" id="editNewsTitle" value="${newsItem.title}" required style="width: 100%; padding: 10px; background: #111; border: 1px solid #444; color: #fff; border-radius: 4px; box-sizing: border-box;" />
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 6px; font-size: 0.85rem; color: #ccc;">เนื้อหาประกาศ</label>
        <textarea id="editNewsContent" rows="5" required style="width: 100%; padding: 10px; background: #111; border: 1px solid #444; color: #fff; border-radius: 4px; box-sizing: border-box;">${newsItem.content}</textarea>
      </div>
      <div class="form-group" style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 6px; font-size: 0.85rem; color: #ccc;">รูปภาพประกาศ (Image URL)</label>
        <input type="text" id="editNewsImageUrl" value="${newsItem.imageUrl || ""}" placeholder="https://..." style="width: 100%; padding: 10px; background: #111; border: 1px solid #444; color: #fff; border-radius: 4px; box-sizing: border-box;" />
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button type="submit" class="btn-secondary" style="background: #28a745; color: #fff; font-weight: bold; padding: 8px 16px; border-radius: 4px; cursor: pointer;">💾 บันทึกการแก้ไข</button>
        <button type="button" class="btn-secondary" style="background: #444; color: #fff; padding: 8px 16px; border-radius: 4px; cursor: pointer;" onclick="openNewsDetailModal(${newsIdx})">ยกเลิก</button>
      </div>
    </form>
  `;
};

window.saveEditedProjectNews = async function(e, newsIdx) {
  e.preventDefault();
  if (currentProjectIndexForWindow3 === null || currentProjectIndexForWindow3 === undefined) return;
  const proj = projects[currentProjectIndexForWindow3];
  if (!proj || !proj.projectNews) return;

  const oldNewsItem = proj.projectNews[newsIdx];
  const title = document.getElementById("editNewsTitle").value.trim();
  const content = document.getElementById("editNewsContent").value.trim();
  const imageUrl = document.getElementById("editNewsImageUrl").value.trim();

  if (!title || !content) return;

  const currentDateTime = new Date().toLocaleString("th-TH");
  const updatedNewsItem = {
    ...oldNewsItem,
    title,
    content,
    imageUrl,
    date: `${currentDateTime} (แก้ไขแล้ว)`
  };
  proj.projectNews[newsIdx] = updatedNewsItem;

  try {
    await updateDoc(doc(db, "projects", proj.firebaseId), {
      projectNews: proj.projectNews,
      updatedAt: serverTimestamp(),
      updatedAtString: currentDateTime,
    });
    
    await logAdminAction(
      "แก้ไขประกาศโปรเจกต์", 
      `แก้ไขประกาศ "${title}" ในโปรเจกต์ ${proj.name}`,
      oldNewsItem,
      updatedNewsItem
    );

    renderProjectNewsList();
    openNewsDetailModal(newsIdx);
    alert("✅ แก้ไขประกาศสำเร็จ!");
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
};

window.handleSaveProjectNews = async function (e) {
  e.preventDefault();
  if (currentProjectIndexForWindow3 === null || currentProjectIndexForWindow3 === undefined) return;
  const proj = projects[currentProjectIndexForWindow3];
  if (!proj) return;

  const titleInput = document.getElementById("pNewsTitle");
  const contentInput = document.getElementById("pNewsContent");
  const imgInput = document.getElementById("pNewsImageUrl");

  const title = titleInput ? titleInput.value.trim() : "";
  const content = contentInput ? contentInput.value.trim() : "";
  const imageUrl = imgInput ? imgInput.value.trim() : "";

  if (!title || !content) return;

  const pNews = proj.projectNews || [];
  const currentDateTime = new Date().toLocaleString("th-TH");
  const newNewsItem = { title, content, imageUrl, date: currentDateTime };
  pNews.unshift(newNewsItem);

  try {
    await updateDoc(doc(db, "projects", proj.firebaseId), {
      projectNews: pNews,
      updatedAt: serverTimestamp(),
      updatedAtString: currentDateTime,
    });
    
    await logAdminAction(
      "ส่งประกาศโปรเจกต์ (หน้า 3)", 
      `สร้างประกาศใหม่ "${title}" ในโปรเจกต์ ${proj.name}`,
      null,
      newNewsItem
    );

    if (titleInput) titleInput.value = "";
    if (contentInput) contentInput.value = "";
    if (imgInput) imgInput.value = "";
    renderProjectNewsList();
    alert("✅ ส่งประกาศเฉพาะกลุ่มใน 3 สำเร็จ!");
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
};

window.deleteProjectNews = async function (newsIdx) {
  const step1 = confirm("⚠️ [ยืนยันการลบประกาศ 1/2]\nคุณต้องการลบประกาศนี้ใช่หรือไม่?");
  if (!step1) return;

  const step2Input = prompt("🔴 [ยืนยันการลบประกาศ 2/2 - ความปลอดภัยสูงสุด]\nพิมพ์คำว่า \"DELETE\" เพื่อยืนยันการลบประกาศนี้:");
  if (step2Input !== "DELETE") {
    alert("❌ ยกเลิกการลบประกาศเนื่องจากคำยืนยันไม่ถูกต้อง");
    return;
  }

  if (currentProjectIndexForWindow3 === null || currentProjectIndexForWindow3 === undefined) return;
  const proj = projects[currentProjectIndexForWindow3];
  if (!proj || !proj.projectNews) return;

  const deletedNewsItem = proj.projectNews[newsIdx];
  proj.projectNews.splice(newsIdx, 1);
  const currentDateTime = new Date().toLocaleString("th-TH");
  
  try {
    await updateDoc(doc(db, "projects", proj.firebaseId), {
      projectNews: proj.projectNews,
      updatedAt: serverTimestamp(),
      updatedAtString: currentDateTime,
    });
    
    await logAdminAction(
      "ลบประกาศโปรเจกต์", 
      `ลบประกาศ "${deletedNewsItem?.title || "ประกาศ"}" จากโปรเจกต์ ${proj.name}`,
      deletedNewsItem,
      null
    );

    renderProjectNewsList();
    const modal = document.getElementById("projectNewsDetailModal");
    if (modal) modal.style.display = 'none';
    alert("🗑️ ลบประกาศสำเร็จ");
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
};