import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  getDoc,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA-SB3kOtVOK0xwEt2xjF6JJHZKPYhNURY",
  authDomain: "bloodrune-project.firebaseapp.com",
  projectId: "bloodrune-project",
  storageBucket: "bloodrune-project.firebasestorage.app",
  messagingSenderId: "394744755352",
  appId: "1:394744755352:web:0af156b7f8c888dc164ced",
  measurementId: "G-B6BX636YH3",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let projects = [];
let news = [];
let users = [];
let currentProjectIndex = null;
let selectedAppIndexForInterview = null;
let currentProjectIndexForWindow3 = null;
let currentProjectIndexForStage2Config = null;

// ==========================================
// 🔒 AUTHENTICATION CHECK
// ==========================================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("⚠️ กรุณาเข้าสู่ระบบก่อนใช้งานหน้าผู้ดูแลระบบ");
    window.location.href = "login-signin.html";
    return;
  }

  try {
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      const roleUser = userData.RoleUser || userData.status || "";

      if (roleUser.toLowerCase() !== "admin" && userData.isAdmin !== true) {
        alert("❌ คุณไม่มีสิทธิ์เข้าถึงหน้าผู้ดูแลระบบ (สำหรับ Admin เท่านั้น)");
        window.location.href = "index.html";
        return;
      }
    }
    initAdminPanel();
  } catch (err) {
    console.error("Auth verification error:", err);
    initAdminPanel();
  }
});

function isCountedAsPassed(status) {
  const countedStatuses = [
    "step_1_2_passed",
    "passed",
    "step_2_submitted",
    "stage2_submitted",
    "step_2_revision",
    "revision_requested",
    "step_1_9_5_requested",
    "edit_requested",
    "step_1_9_5_allowed",
    "edit_allowed",
    "step_3_approved",
    "approved",
    "step_3_completed",
    "completed",
    "step_1_2_5_pending",
    "role_pending_review",
    "step_1_2_5_revision"
  ];
  return countedStatuses.includes(status);
}

window.switchTab = function (tabId, btnElement) {
  document
    .querySelectorAll(".tab-content")
    .forEach((tab) => tab.classList.remove("active"));
  document
    .querySelectorAll(".nav-tab")
    .forEach((btn) => btn.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  btnElement.classList.add("active");
};

// ==========================================
// REALTIME FIREBASE LISTENERS
// ==========================================
function initAdminPanel() {
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
  });

  const newsQuery = query(collection(db, "news"), orderBy("date", "desc"));
  onSnapshot(newsQuery, (snapshot) => {
    news = [];
    snapshot.forEach((docSnap) => {
      news.push({ firebaseId: docSnap.id, ...docSnap.data() });
    });
    renderNews();
  });

  onSnapshot(collection(db, "users"), (snapshot) => {
    users = [];
    snapshot.forEach((docSnap) => {
      users.push({ firebaseId: docSnap.id, ...docSnap.data() });
    });
    renderUsers();
  });
}

// ==========================================
// 1. PROJECT SYSTEM & SEARCH
// ==========================================
window.renderProjects = function() {
  const container = document.getElementById("projectList");
  if (!container) return;

  const searchInputElem = document.getElementById("adminProjSearch");
  const keyword = searchInputElem ? searchInputElem.value.toLowerCase().trim() : "";
  container.innerHTML = "";

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
    
    // ตรวจสอบและดึงค่าสถานะอย่างแม่นยำ
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
      const urls = proj.imageUrl
        .split(/[\n,]+/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0);
      if (urls.length > 0) {
        let imgs = "";
        urls.forEach((url) => {
          imgs += `<div style="flex: 0 0 100px; height: 80px; border-radius: 4px; overflow: hidden; background: #000; border: 1px solid #333;"><img src="${url}" alt="Project Img" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'"/></div>`;
        });
        imagePreviewHtml = `<div style="display: flex; gap: 8px; overflow-x: auto; margin-bottom: 10px; padding-bottom: 5px;">${imgs}</div>`;
      }
    }

    let descHtml = proj.description
      ? `<p style="font-size: 0.85rem; color: #bbb; margin-bottom: 8px; font-style: italic;">"${proj.description}"</p>`
      : "";

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      ${imagePreviewHtml}
      <span class="card-status ${statusBadgeClass}">
        ${statusBadgeText}
      </span>
      <h4 class="card-title">${proj.name}</h4>${descHtml}
      <div class="card-info">
        <p><strong>ความจุ:</strong> ทั้งหมด ${proj.maxMembers} คน | ผ่านแล้ว <span style="color:#28a745; font-weight:bold;">${approvedCount}</span> คน | เหลือ <span style="color:#ff2a2a; font-weight:bold;">${remainingSeats}</span> ที่</p>
        <p style="margin-top:6px;"><strong>สถานะบทบาท:</strong></p>
        <ul style="padding-left: 15px; font-size: 0.85rem; color: #ccc;">${rolesHtml}</ul>
      </div>
      
      <div class="card-actions" style="margin-top: 12px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
          <button class="btn-secondary" onclick="editProject(${index})" style="background:#2a2a2a; width:100%;">⚙️ ตั้งค่าโปรเจกต์</button>
          <button class="btn-secondary" onclick="openStage2Config(${index})" style="background:#17a2b8; width:100%;">📝 ฟอร์มรอบ 2</button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
          <button class="btn-secondary" onclick="openProjectWindow3(${index})" style="background:#28a745; width:100%;">📢 บอร์ด (3)</button>
          <button class="btn-secondary" onclick="viewApps(${index})" style="background:#444; width:100%;">📋 ผู้สมัคร (${proj.applications ? proj.applications.length : 0})</button>
          <button class="btn-secondary" style="background: #c9302c; width:100%;" onclick="deleteProject(${index})">🗑️ ลบ</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
};

window.openProjectModal = function () {
  document.getElementById("projectModalTitle").innerText = "สร้างโปรเจกต์ใหม่";
  document.getElementById("projId").value = "";
  document.getElementById("projName").value = "";
  if (document.getElementById("projImageUrl")) document.getElementById("projImageUrl").value = "";
  if (document.getElementById("projDescription")) document.getElementById("projDescription").value = "";
  document.getElementById("projMaxMembers").value = "";
  
  // ตั้งค่า Default สถานะโปรเจกต์ใหม่ให้เป็น open เสมอ
  const statusSelect = document.getElementById("projStatus");
  if (statusSelect) statusSelect.value = "open";

  document.getElementById("roleInputsContainer").innerHTML = "";
  document.getElementById("customQuestionsContainer").innerHTML = "";
  window.addRoleInput();
  window.addQuestionInput("วันเดือนปีเกิด", "date", []);
  window.addQuestionInput("อีเมลติดต่อกลับ", "email", []);
  window.addQuestionInput("เคยเล่นโรลมาก่อนไหม", "radio", ["เคย", "ไม่เคย"]);
  document.getElementById("projectModal").classList.add("open");
};

window.closeProjectModal = function () {
  document.getElementById("projectModal").classList.remove("open");
};

window.addRoleInput = function (name = "", count = "") {
  const container = document.getElementById("roleInputsContainer");
  const div = document.createElement("div");
  div.className = "role-row";
  div.innerHTML = `
    <input type="text" placeholder="ชื่อบทบาท (เช่น C# Dev)" class="role-name" value="${name}" required style="flex:1;" />
    <input type="number" placeholder="จำนวน" class="role-count" value="${count}" min="1" required style="width: 90px;" />
    <button type="button" onclick="this.parentElement.remove()" style="background:#ff2a2a; color:#fff; border:none; padding:0 10px; border-radius:4px; cursor:pointer;">✕</button>
  `;
  container.appendChild(div);
};

// ==========================================
// FORM BUILDER UI (คำถามส่วนที่ 1)
// ==========================================
window.addQuestionInput = function (qText = "", qType = "text", optionsList = []) {
  const container = document.getElementById("customQuestionsContainer");
  const div = document.createElement("div");
  div.className = "question-row";
  div.style.cssText = "display: flex; flex-direction: column; width: 100%; box-sizing: border-box; background: #222; border: 1px solid #3c3c3c; border-left: 4px solid #4a90e2; padding: 16px; border-radius: 8px; margin-bottom: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);";

  const isMultiType = ['radio', 'checkbox', 'select'].includes(qType);

  div.innerHTML = `
    <div style="display: flex; width: 100%; gap: 12px; align-items: center; box-sizing: border-box;">
      <input type="text" placeholder="หัวข้อคำถาม" class="question-title" value="${qText}" required style="flex: 2; width: 100%; padding: 10px 12px; background: #181818; border: 1px solid #444; color: #fff; border-radius: 6px; font-size: 0.95rem; box-sizing: border-box;" />
      <select class="question-type" style="flex: 1; padding: 10px 12px; background: #181818; border: 1px solid #444; color: #fff; border-radius: 6px; font-size: 0.9rem; box-sizing: border-box;" onchange="toggleOptionsBuilder(this)">
        <option value="text" ${qType === "text" ? "selected" : ""}>📝 ข้อความสั้น</option>
        <option value="textarea" ${qType === "textarea" ? "selected" : ""}>📄 ข้อความยาว</option>
        <option value="radio" ${qType === "radio" ? "selected" : ""}>🔘 หลายตัวเลือก (เลือก 1 ข้อ)</option>
        <option value="checkbox" ${qType === "checkbox" ? "selected" : ""}>☑️ ช่องทำเครื่องหมาย (เลือกหลายข้อ)</option>
        <option value="select" ${qType === "select" ? "selected" : ""}>🔽 รายการแบบดร็อปดาวน์</option>
        <option value="number" ${qType === "number" ? "selected" : ""}>🔢 ตัวเลข</option>
        <option value="date" ${qType === "date" ? "selected" : ""}>📅 วันที่</option>
        <option value="email" ${qType === "email" ? "selected" : ""}>📧 อีเมล</option>
      </select>
    </div>

    <div class="options-builder-area" style="display: ${isMultiType ? 'block' : 'none'}; width: 100%; margin-top: 12px; padding-top: 10px; border-top: 1px dashed #383838; box-sizing: border-box;">
      <div class="options-list-container" style="display: flex; flex-direction: column; width: 100%; gap: 10px; margin-bottom: 10px;"></div>
      <button type="button" onclick="addOptionRow(this)" style="background: transparent; color: #4a90e2; border: 1px dashed #4a90e2; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: bold; display: inline-flex; align-items: center; gap: 6px;">
        ➕ เพิ่มตัวเลือก
      </button>
    </div>

    <div style="display: flex; width: 100%; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 14px; padding-top: 10px; border-top: 1px solid #2d2d2d; box-sizing: border-box;">
      <button type="button" title="เลื่อนขึ้น" onclick="moveQuestionRow(this, -1)" style="background:#2a2a2a; color:#ccc; border:1px solid #444; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.85rem;">▲ เลื่อนขึ้น</button>
      <button type="button" title="เลื่อนลง" onclick="moveQuestionRow(this, 1)" style="background:#2a2a2a; color:#ccc; border:1px solid #444; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.85rem;">▼ เลื่อนลง</button>
      <span style="color:#444; margin: 0 2px;">|</span>
      <button type="button" title="ลบคำถาม" onclick="this.closest('.question-row').remove()" style="background:#c9302c; color:#fff; border:none; padding:6px 14px; border-radius:4px; cursor:pointer; font-weight:bold; font-size: 0.85rem;">🗑️ ลบคำถาม</button>
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

// ==========================================
// FORM BUILDER UI (คำถามส่วนที่ 2)
// ==========================================
window.addStage2QuestionInput = function (qText = "", qType = "text", optionsList = [], placeholder = "") {
  const container = document.getElementById("stage2QuestionsContainer");
  const wrapper = document.createElement("div");
  wrapper.className = "stage2-question-row";
  wrapper.style.cssText = "display: flex; flex-direction: column; width: 100%; box-sizing: border-box; background: #222; border: 1px solid #3c3c3c; border-left: 4px solid #17a2b8; padding: 16px; border-radius: 8px; margin-bottom: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);";

  const isMultiType = ['radio', 'checkbox', 'select'].includes(qType);

  wrapper.innerHTML = `
    <div style="display: flex; width: 100%; gap: 12px; align-items: center; box-sizing: border-box;">
      <input type="text" placeholder="หัวข้อคำถาม / ชื่อเอกสาร" class="s2-q-title" value="${qText}" required style="flex: 2; width: 100%; padding: 10px 12px; background: #181818; border: 1px solid #444; color: #fff; border-radius: 6px; font-size: 0.95rem; box-sizing: border-box;" />
      <select class="s2-q-type" style="flex: 1; padding: 10px 12px; background: #181818; border: 1px solid #444; color: #fff; border-radius: 6px; font-size: 0.9rem; box-sizing: border-box;" onchange="toggleOptionsBuilder(this)">
        <option value="text" ${qType === "text" ? "selected" : ""}>📝 ข้อความสั้น</option>
        <option value="textarea" ${qType === "textarea" ? "selected" : ""}>📄 ข้อความยาว</option>
        <option value="radio" ${qType === "radio" ? "selected" : ""}>🔘 หลายตัวเลือก (เลือก 1 ข้อ)</option>
        <option value="checkbox" ${qType === "checkbox" ? "selected" : ""}>☑️ ช่องทำเครื่องหมาย (เลือกหลายข้อ)</option>
        <option value="select" ${qType === "select" ? "selected" : ""}>🔽 รายการแบบดร็อปดาวน์</option>
        <option value="number" ${qType === "number" ? "selected" : ""}>🔢 ตัวเลข</option>
        <option value="date" ${qType === "date" ? "selected" : ""}>📅 วันที่</option>
        <option value="email" ${qType === "email" ? "selected" : ""}>📧 อีเมล</option>
        <option value="image" ${qType === "image" ? "selected" : ""}>📷 อัปโหลดภาพ / รูปเอกสาร</option>
      </select>
    </div>

    <div class="question-preview-area" style="width: 100%; margin-top: 12px; padding: 10px 12px; background: #181818; border: 1px dashed #444; border-radius: 6px; box-sizing: border-box;">
      <span style="font-size: 0.75rem; color: #888; display: block; margin-bottom: 4px;">👁️ แสดงผลจริงรอบ 2:</span>
      <input type="text" class="q-placeholder-input" value="${placeholder}" placeholder="[ช่องข้อความธรรมดาที่ลิงก์กับโปรเจกต์]" style="width: 100%; padding: 8px 10px; background: #111; border: 1px solid #333; color: #fff; border-radius: 4px; font-size: 0.85rem; box-sizing: border-box;" />
    </div>

    <div class="options-builder-area" style="display: ${isMultiType ? 'block' : 'none'}; width: 100%; margin-top: 12px; padding-top: 10px; border-top: 1px dashed #383838; box-sizing: border-box;">
      <div class="options-list-container" style="display: flex; flex-direction: column; width: 100%; gap: 10px; margin-bottom: 10px;"></div>
      <button type="button" onclick="addOptionRow(this)" style="background: transparent; color: #17a2b8; border: 1px dashed #17a2b8; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: bold; display: inline-flex; align-items: center; gap: 6px;">
        ➕ เพิ่มตัวเลือก
      </button>
    </div>

    <div style="display: flex; width: 100%; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 14px; padding-top: 10px; border-top: 1px solid #2d2d2d; box-sizing: border-box;">
      <button type="button" title="เลื่อนขึ้น" onclick="moveQuestionRow(this, -1)" style="background:#2a2a2a; color:#ccc; border:1px solid #444; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.85rem;">▲ เลื่อนขึ้น</button>
      <button type="button" title="เลื่อนลง" onclick="moveQuestionRow(this, 1)" style="background:#2a2a2a; color:#ccc; border:1px solid #444; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.85rem;">▼ เลื่อนลง</button>
      <span style="color:#444; margin: 0 2px;">|</span>
      <button type="button" title="ลบคำถาม" onclick="this.closest('.stage2-question-row').remove()" style="background:#c9302c; color:#fff; border:none; padding:6px 14px; border-radius:4px; cursor:pointer; font-weight:bold; font-size: 0.85rem;">🗑️ ลบคำถาม</button>
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
    <button type="button" title="ลบตัวเลือกนี้" onclick="this.parentElement.remove()" style="background: transparent; color: #888; border: none; font-size: 1.1rem; cursor: pointer; padding: 0 8px; flex-shrink: 0;">✕</button>
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
  const index = document.getElementById("projId").value;
  const name = document.getElementById("projName").value.trim();
  const imageUrl = document.getElementById("projImageUrl") ? document.getElementById("projImageUrl").value.trim() : "";
  const description = document.getElementById("projDescription") ? document.getElementById("projDescription").value.trim() : "";
  const maxMembers = Number(document.getElementById("projMaxMembers").value);
  
  const statusElem = document.getElementById("projStatus");
  const status = statusElem ? statusElem.value : "open";
  // ปรับการซิงค์ค่าระหว่าง status และ hidden ให้ตรงกันเสมอ
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
      const optInputs = row.querySelectorAll(".opt-val-input");
      optInputs.forEach(input => {
        const val = input.value.trim();
        if (val) options.push(val);
      });
    }

    if (title !== "") {
      customQuestions.push({ title, type, options });
    }
  });

  const currentDateTime = new Date().toLocaleString("th-TH");
  const projData = {
    name,
    imageUrl,
    description,
    maxMembers,
    status,
    hidden,
    roles,
    customQuestions,
    updatedAt: serverTimestamp(),
    updatedAtString: currentDateTime,
  };

  try {
    if (index !== "") {
      await updateDoc(
        doc(db, "projects", projects[index].firebaseId),
        projData,
      );
    } else {
      projData.applications = [];
      projData.projectNews = [];
      projData.stage2Description =
        "กรุณากรอกข้อมูลและแนบลิงก์รูปภาพประกอบตามหัวข้อด้านล่างให้ครบถ้วน";
      projData.stage2Questions = [
        { title: "ลิงก์ช่องทางติดต่อเพิ่มเติม (Discord / Facebook)", type: "text", options: [], placeholder: "" },
        { title: "ประสบการณ์การทำงาน (ปี)", type: "number", options: [], placeholder: "" },
        { title: "แนบลิงก์ภาพผลงาน / รูปเอกสาร", type: "image", options: [], placeholder: "" },
      ];
      projData.createdAt = serverTimestamp();
      projData.createdAtString = currentDateTime;
      await addDoc(collection(db, "projects"), projData);
    }
    window.closeProjectModal();
    alert("✅ บันทึกโปรเจกต์สำเร็จ!");
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
};

window.editProject = function (index) {
  const proj = projects[index];
  document.getElementById("projectModalTitle").innerText = "แก้ไขโปรเจกต์";
  document.getElementById("projId").value = index;
  document.getElementById("projName").value = proj.name;
  if (document.getElementById("projImageUrl")) document.getElementById("projImageUrl").value = proj.imageUrl || "";
  if (document.getElementById("projDescription")) document.getElementById("projDescription").value = proj.description || "";
  document.getElementById("projMaxMembers").value = proj.maxMembers;
  
  // ซิงค์การดึงสถานะเข้า Select element ให้ถูกต้องแม่นยำ
  const statusSelect = document.getElementById("projStatus");
  if (statusSelect) {
    statusSelect.value = proj.status || (proj.hidden === true || proj.hidden === "true" ? "hidden" : "open");
  }

  const roleContainer = document.getElementById("roleInputsContainer");
  roleContainer.innerHTML = "";
  if (proj.roles)
    proj.roles.forEach((r) => window.addRoleInput(r.name, r.count));

  const qContainer = document.getElementById("customQuestionsContainer");
  qContainer.innerHTML = "";
  if (proj.customQuestions)
    proj.customQuestions.forEach((q) =>
      window.addQuestionInput(q.title, q.type, q.options || []),
    );

  document.getElementById("projectModal").classList.add("open");
};

window.deleteProject = async function (index) {
  if (confirm(`⚠️ ยืนยันการลบโปรเจกต์ "${projects[index].name}"?`)) {
    try {
      await deleteDoc(doc(db, "projects", projects[index].firebaseId));
    } catch (err) {
      alert("❌ ลบไม่สำเร็จ: " + err.message);
    }
  }
};

// ==========================================
// STAGE 2 CONFIG
// ==========================================
window.openStage2Config = function (index) {
  currentProjectIndexForStage2Config = index;
  const proj = projects[index];

  document.getElementById("stage2Description").value =
    proj.stage2Description || "";

  const container = document.getElementById("stage2QuestionsContainer");
  container.innerHTML = "";

  const s2Questions = proj.stage2Questions || [];
  if (s2Questions.length > 0) {
    s2Questions.forEach((q) => window.addStage2QuestionInput(q.title, q.type, q.options || [], q.placeholder || ""));
  } else {
    window.addStage2QuestionInput();
  }

  document.getElementById("stage2ConfigModal").classList.add("open");
};

window.closeStage2ConfigModal = function () {
  document.getElementById("stage2ConfigModal").classList.remove("open");
  currentProjectIndexForStage2Config = null;
};

window.handleSaveStage2Config = async function (e) {
  e.preventDefault();
  if (currentProjectIndexForStage2Config === null) return;
  const proj = projects[currentProjectIndexForStage2Config];

  const stage2Description = document
    .getElementById("stage2Description")
    .value.trim();
  
  const questionRows = document.querySelectorAll("#stage2QuestionsContainer .stage2-question-row");
  let stage2Questions = [];

  questionRows.forEach(row => {
    const title = row.querySelector(".s2-q-title").value.trim();
    const type = row.querySelector(".s2-q-type").value;
    const placeholder = row.querySelector(".q-placeholder-input") ? row.querySelector(".q-placeholder-input").value.trim() : "";
    let options = [];

    if (['radio', 'checkbox', 'select'].includes(type)) {
      const optInputs = row.querySelectorAll(".opt-val-input");
      optInputs.forEach(input => {
        const val = input.value.trim();
        if (val) options.push(val);
      });
    }

    if (title !== "") {
      stage2Questions.push({ title, type, options, placeholder });
    }
  });

  const currentDateTime = new Date().toLocaleString("th-TH");
  try {
    await updateDoc(doc(db, "projects", proj.firebaseId), {
      stage2Description,
      stage2Questions,
      updatedAt: serverTimestamp(),
      updatedAtString: currentDateTime,
    });
    window.closeStage2ConfigModal();
    alert("✅ บันทึกคำอธิบายและรูปแบบฟอร์มรอบสองสำเร็จ!");
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
};

// ==========================================
// 📋 APPLICATIONS & DETAILED STEPS MANAGEMENT
// ==========================================
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
    if (Array.isArray(app.choices)) {
      rawChoices = rawChoices.concat(app.choices);
    } else if (typeof app.choices === "string" && app.choices.trim() !== "") {
      rawChoices.push(app.choices.trim());
    }
  }

  if (app.answers) {
    if (Array.isArray(app.answers)) {
      app.answers.forEach((ans) => {
        if (ans && ans.value !== undefined) {
          if (Array.isArray(ans.value)) {
            rawChoices = rawChoices.concat(ans.value);
          } else if (typeof ans.value === "string" && ans.value.trim() !== "") {
            const splitVals = ans.value.split(/[,,\n]+/).map((v) => v.trim()).filter((v) => v.length > 0);
            rawChoices = rawChoices.concat(splitVals);
          }
        }
      });
    } else if (typeof app.answers === "object") {
      for (const [q, a] of Object.entries(app.answers)) {
        if (typeof a === "string" && a.trim() !== "") {
          const splitVals = a.split(/[,,\n]+/).map((v) => v.trim()).filter((v) => v.length > 0);
          rawChoices = rawChoices.concat(splitVals);
        } else if (Array.isArray(a)) {
          rawChoices = rawChoices.concat(a);
        }
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
    if (targetRole && !matchedRoles.includes(targetRole.name)) {
      matchedRoles.push(targetRole.name);
    }
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
          const titleLower = (ans.title || "").toLowerCase();
          if ((titleLower.includes("ชื่อ") || titleLower.includes("name")) && !applicantRealName) {
            applicantRealName = val;
          }
          round1Html += `<p style="margin:4px 0; font-size:0.85rem; color:#ccc;">• <strong>${ans.title || "คำถาม"}:</strong> <span style="color:#fff;">${val}</span></p>`;
        });
      } else if (typeof app.answers === "object") {
        for (const [q, a] of Object.entries(app.answers)) {
          let val = Array.isArray(a) ? a.join(", ") : (a !== undefined && a !== null ? a : "-");
          const titleLower = (q || "").toLowerCase();
          if ((titleLower.includes("ชื่อ") || titleLower.includes("name")) && !applicantRealName) {
            applicantRealName = val;
          }
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
    if (appStatus === "step_1_2_passed" || appStatus === "passed") statusBadge = '<span class="badge-status status-passed">1.2 ผ่าน & ล็อคบทบาทแล้ว (เข้าสู่ 2)</span>';
    if (appStatus === "step_1_2_5_pending" || appStatus === "role_pending_review") statusBadge = `<span class="badge-status" style="background:#17a2b8; color:#fff;">⏳ 1.2.5 รออนุมัติอุทธรณ์บทบาท (${app.pendingAppealRole || "-"})</span>`;
    if (appStatus === "step_1_2_5_revision" || appStatus === "revision_requested") statusBadge = '<span class="badge-status" style="background:#f0ad4e; color:#000;">🔄 1.2.5 แจ้งให้เลือกอุทธรณ์บทบาทใหม่</span>';
    if (appStatus === "step_1_9_5_requested" || appStatus === "edit_requested") statusBadge = '<span class="badge-status" style="background:#f0ad4e; color:#000;">1.9.5 ขอแก้ไขเอกสารรอบ 2 (รอแอดมินอนุมัติ)</span>';
    if (appStatus === "step_1_9_5_allowed" || appStatus === "edit_allowed") statusBadge = '<span class="badge-status" style="background:#28a745; color:#fff;">🔓 1.9.5 แอดมินอนุมัติให้แก้ไขแล้ว</span>';
    if (appStatus === "step_2_submitted" || appStatus === "stage2_submitted") statusBadge = '<span class="badge-status" style="background:#17a2b8; color:#fff;">2.1 ส่งเอกสารรอบ 2 แล้ว (รอแอดมินยืนยันหรือตีกลับ)</span>';
    if (appStatus === "step_3_approved" || appStatus === "approved") statusBadge = `<span class="badge-status status-approved">3. เข้าสู่โปรเจกต์แล้ว (${app.assignedRole || "สมาชิก"})</span>`;
    if (appStatus === "rejected") statusBadge = '<span class="badge-status status-rejected">❌ ไม่ผ่านการคัดเลือก / ยกเลิก</span>';

    let choiceSummaryTag = "";
    if (userChoices.length > 0) {
      choiceSummaryTag = `<div style="font-size:0.8rem; color:#f0ad4e; margin-top:2px;">⭐ ตัวเลือกบทบาท: ${userChoices.map((c, i) => `อันดับ ${i + 1}:${c}`).join(" | ")}</div>`;
    }
    let lockedRoleTag = "";
    if (app.assignedRole) {
      lockedRoleTag = `<div style="font-size:0.80rem; color:#28a745; font-weight:bold; margin-top:2px;">🔒 ล็อคบทบาท: ${app.assignedRole}${app.approvedRank ? `(จากอันดับ ${app.approvedRank})` : ""}</div>`;
    }

    let realNameBadge = applicantRealName ? `<div style="font-size:0.85rem; color:#4a90e2; font-weight:bold; margin-top:2px;">🏷️ ชื่อจริงจากแบบฟอร์ม: ${applicantRealName}</div>` : "";

    let actionButtons = "";

    if (appStatus === "pending_application" || appStatus === "pending" || !appStatus) {
      actionButtons = `
        <button class="btn-secondary" style="background:#f0ad4e; color:#000;" onclick="openInterviewPrompt('${app.uid}')">📅 1. ตั้งค่าวัน/เวลาสัมภาษณ์</button>
        <button class="btn-secondary" style="background:#c9302c;" onclick="updateAppStatusByUid('${app.uid}', 'rejected')">❌ ปฏิเสธการสมัคร</button>
      `;
    } 
    else if (appStatus === "step_1_1_interview" || appStatus === "interview") {
      actionButtons = `
        <button class="btn-secondary" style="background:#17a2b8;" onclick="openApplicationChoicesModalByUid('${app.uid}')">✅ 1.2 พิจารณาบทบาท (อันดับ 1, 2, 3)</button>
        <button class="btn-secondary" style="background:#f0ad4e; color:#000;" onclick="openInterviewPrompt('${app.uid}')">📅 เปลี่ยนวันนัดสัมภาษณ์</button>
        <button class="btn-secondary" style="background:#c9302c;" onclick="updateAppStatusByUid('${app.uid}', 'rejected')">❌ ปฏิเสธผ่านสัมภาษณ์</button>
      `;
    } 
    else if (appStatus === "step_1_2_5_pending" || appStatus === "role_pending_review") {
      actionButtons = `
        <button class="btn-secondary" style="background:#28a745;" onclick="adminReviewRoleByUid('${app.uid}', 'approve')">✅ 1.2.5 อนุมัติอุทธรณ์บทบาท (${app.pendingAppealRole})</button>
        <button class="btn-secondary" style="background:#c9302c;" onclick="adminReviewRoleByUid('${app.uid}', 'reject')">❌ 1.2.5 ปฏิเสธอุทธรณ์</button>
      `;
    } 
    else if (appStatus === "step_1_9_5_requested" || appStatus === "edit_requested") {
      actionButtons = `
        <button class="btn-secondary" style="background:#28a745;" onclick="approveEditRequestByUid('${app.uid}')">🔓 1.9.5 อนุมัติคำขอแก้ไข</button>
        <button class="btn-secondary" style="background:#c9302c;" onclick="rejectEditRequestByUid('${app.uid}')">❌ 1.9.5 ไม่อนุมัติคำขอแก้ไข</button>
      `;
    } 
    else if (appStatus === "step_1_2_passed" || appStatus === "step_1_9_5_allowed" || appStatus === "step_1_2_5_revision" || appStatus === "passed" || appStatus === "edit_allowed" || appStatus === "revision_requested") {
      actionButtons = `
        <span style="font-size:0.85rem; color:#f0ad4e; align-self:center;">⏳ [2. กำลังส่งเอกสารรอบ 2] แอดมินจะต้องรอผู้ใช้ส่งเอกสารเท่านั้น และทำอะไรไม่ได้ทั้งสิ้น</span>
      `;
    } 
    else if (appStatus === "step_2_submitted" || appStatus === "stage2_submitted") {
      actionButtons = `
        <button class="btn-secondary" style="background:#28a745;" onclick="updateAppStatusByUid('${app.uid}', 'step_3_approved')">🎯 2.1 ยืนยันข้อมูล & เข้าสู่ขั้นตอนที่ 3</button>
        <button class="btn-secondary" style="background:#f0ad4e; color:#000;" onclick="openRevisionPromptByUid('${app.uid}')">🔄 2.1 ตีกลับรอบ 2 ให้แก้ไข (กลับไปขั้นตอน 2)</button>
      `;
    } 
    else if (appStatus === "step_3_approved" || appStatus === "approved") {
      actionButtons = `<span style="font-size:0.85rem; color:#28a745;">✨ [3. เข้าสู่โปรเจกต์แล้ว] จัดการประกาศและสมาชิกเฉพาะกลุ่มได้ที่บอร์ดโปรเจกต์</span>`;
    } else {
      actionButtons = ``;
    }

    container.innerHTML += `
      <div class="app-item" style="background:#141414; border:1px solid #333; padding:12px; border-radius:6px; margin-bottom:10px;">
        <div><strong>👤 ${app.user || "ไม่ระบุชื่อ"}</strong> ${statusBadge}</div>
        ${realNameBadge}
        ${choiceSummaryTag}
        ${lockedRoleTag}
        <div style="font-size:0.8rem; color:#aaa; margin-top:4px; margin-bottom:6px;">📧 ${app.accountEmail || "-"} | สมัครเมื่อ: ${app.createdAtString || "-"}</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; align-items: stretch;">
          <div style="background:#1c1c1c; padding:10px; border-radius:4px; display:flex; flex-direction:column; justify-content:flex-start; box-sizing:border-box;">
            <p style="color:#ff2a2a; font-size:0.8rem; font-weight:bold; margin-top:0; margin-bottom:8px;">📋 ข้อมูลรอบ 1 (สมัคร):</p>
            <div style="flex:1;">${round1Html}</div>
          </div>
          <div style="background:#1c1c1c; padding:10px; border-radius:4px; display:flex; flex-direction:column; justify-content:flex-start; box-sizing:border-box;">
            <p style="color:#17a2b8; font-size:0.8rem; font-weight:bold; margin-top:0; margin-bottom:8px;">📝 ข้อมูลรอบ 2:</p>
            <div style="flex:1;">${round2Html}</div>
          </div>
        </div>
        ${app.interviewDate ? `<p style="font-size:0.85rem; color:#f0ad4e; margin-top:6px;">📅 นัดสัมภาษณ์ (1.1): ${app.interviewDate}</p>` : ""}
        ${app.assignedRole && !lockedRoleTag ? `<p style="font-size:0.85rem; color:#28a745; margin-top:6px;">🎯 บทบาทที่ได้รับ: ${app.assignedRole}</p>` : ""}
        ${app.pendingAppealRole ? `<p style="font-size:0.85rem; color:#17a2b8; margin-top:6px;">🔄 บทบาทที่ยื่นอุทธรณ์ (1.2.5): ${app.pendingAppealRole}</p>` : ""}
        ${app.revisionNote ? `<p style="font-size:0.85rem; color:#f0ad4e; margin-top:6px;">💬 หมายเหตุจากแอดมิน: ${app.revisionNote}</p>` : ""}
        ${app.editReason ? `<p style="font-size:0.85rem; color:#f0ad4e; margin-top:6px;">🔄 เหตุผลขอแก้ไข (1.9.5): ${app.editReason}</p>` : ""}
        <div style="display:flex; gap:6px; margin-top:10px; flex-wrap:wrap;">${actionButtons}</div>
      </div>
    `;
  });
};

function checkRoleAvailability(proj, roleName) {
  if (!proj || !proj.roles)
    return { available: false, currentCount: 0, maxCount: 0 };
  const targetRole = proj.roles.find(
    (r) => r.name.trim() === (roleName || "").trim(),
  );
  if (!targetRole) return { available: false, currentCount: 0, maxCount: 0 };

  const filledInRole = proj.applications
    ? proj.applications.filter((a) => {
        const hasRoleAssigned = a.assignedRole === targetRole.name;
        const isValidStatus = [
          "step_1_2_passed",
          "passed",
          "step_2_submitted",
          "stage2_submitted",
          "step_2_revision",
          "revision_requested",
          "step_1_9_5_requested",
          "edit_requested",
          "step_1_9_5_allowed",
          "edit_allowed",
          "step_3_approved",
          "approved",
          "step_3_completed",
          "completed",
          "step_1_2_5_pending",
          "role_pending_review"
        ].includes(a.status);
        return hasRoleAssigned && isValidStatus;
      }).length
    : 0;

  const maxCount = Number(targetRole.count);

  return {
    available: filledInRole < maxCount,
    currentCount: filledInRole,
    maxCount: maxCount,
  };
}

// ==========================================
// 1.2 การพิจารณาบทบาท
// ==========================================
window.openApplicationChoicesModalByUid = function (targetUid) {
  const proj = projects[currentProjectIndex];
  const app = proj.applications.find(a => a.uid === targetUid);
  if (!app) return;

  const choices = extractApplicantChoices(app, proj);
  let choicesHtml = "";

  if (choices.length === 0) {
    choicesHtml = `
      <div style="background:#1c1c1c; padding:12px; border-radius:6px; margin-bottom:12px; border-left:4px solid #17a2b8;">
        <p style="margin:0 0 6px 0; color:#17a2b8; font-weight:bold; font-size:0.9rem;">ℹ️ ผู้สมัครไม่ได้ระบุอันดับบทบาทไว้</p>
      </div>
    `;
  } else {
    choices.forEach((choiceRole, idx) => {
      const rankNumber = idx + 1;
      const roleCheck = checkRoleAvailability(proj, choiceRole);

      let statusColor = "#28a745";
      let statusBadgeText = "ว่าง";
      let statusText = `🟢 ยังว่าง (จับจองแล้ว ${roleCheck.currentCount}/${roleCheck.maxCount} คน)`;
      let actionHtml = `<button class="btn-secondary" style="background:#28a745; padding:6px 12px; font-size:0.85rem; font-weight:bold;" onclick="approveAppWithChoiceByUid('${targetUid}', '${choiceRole}', ${rankNumber})">✅ ล็อคบทบาทนี้ (อันดับ ${rankNumber}) - เข้าสู่ 2 ทันที</button>`;

      if (!roleCheck.available) {
        statusColor = "#ff2a2a";
        statusBadgeText = "เต็ม";
        statusText = `🔴 เต็มแล้ว! (${roleCheck.currentCount}/${roleCheck.maxCount} คน เต็มโควตา)`;
        actionHtml = `<p style="margin:0; font-size:0.75rem; color:#aaa; font-style:italic;">*อันดับนี้เต็มแล้ว (ระบบให้ตรวจสอบอันดับถัดไป หรือส่งไปขั้นตอนอุทธรณ์ 1.2.5)</p>`;
      }

      choicesHtml += `
        <div style="background:#1c1c1c; padding:12px; border-radius:6px; margin-bottom:10px; border-left:5px solid ${statusColor}; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-weight:bold; font-size:0.95rem; color:#fff;">อันดับที่ ${rankNumber}: ${choiceRole}</span>
            <span style="font-size:0.8rem; font-weight:bold; padding:2px 6px; background:${statusColor}33; color:${statusColor}; border-radius:4px;">${statusBadgeText}</span>
          </div>
          <p style="margin:0 0 8px 0; font-size:0.85rem; color:${statusColor}; font-weight:bold;">${statusText}</p>
          ${actionHtml}
        </div>
      `;
    });
  }

  let modal = document.getElementById("appChoicesModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "appChoicesModal";
    modal.style.cssText =
      "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 99999; display: none; align-items: center; justify-content: center;";
    modal.innerHTML = `
      <div class="modal-content" style="background:#181818; border:1px solid #333; max-width:550px; width: 90%; max-height: 90vh; overflow-y: auto; padding:20px; border-radius:8px; color:#fff; box-shadow: 0 10px 25px rgba(0,0,0,0.8);">
        <div id="appChoicesContent"></div>
        <div style="text-align:right; margin-top:15px;">
          <button class="btn-secondary" style="background:#444;" onclick="document.getElementById('appChoicesModal').style.display='none'">ปิดหน้าต่าง</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById("appChoicesContent").innerHTML = `
    <h4 style="margin-top:0; color:#fff; border-bottom:1px solid #333; padding-bottom:8px;">1.2 พิจารณาบทบาท: <span style="color:#f0ad4e;">${app.user || "ไม่ระบุชื่อ"}</span></h4>
    <p style="font-size:0.85rem; color:#aaa; margin-bottom:10px;">นับจากอันดับ 1 ที่ผู้ใช้เลือก -> เต็มเลือกอันที่ 2 -> เต็มเลือกอันที่ 3 -> หากอันสุดท้ายยังเต็ม สามารถส่งไปขั้นตอนอุทธรณ์ 1.2.5 ได้</p>
    ${choicesHtml}
    <hr style="border-color:#333; margin:15px 0;">
    <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:space-between;">
      <button class="btn-secondary" style="background:#f0ad4e; color:#000; font-weight:bold;" onclick="requestNewChoicesByUid('${targetUid}')">🔄 ส่งไปขั้นตอน 1.2.5 (อุทธรณ์บทบาทใหม่)</button>
      <button class="btn-secondary" style="background:#c9302c; font-weight:bold;" onclick="rejectApplicationCompletelyByUid('${targetUid}')">❌ ปฏิเสธการสมัคร</button>
    </div>
  `;

  modal.style.display = "flex";
  modal.classList.add("open");
};

window.approveAppWithChoiceByUid = async function (targetUid, chosenRole, rankNumber) {
  if (!confirm(`ยืนยันล็อคบทบาท "${chosenRole}" (จากอันดับ ${rankNumber}) ให้ผู้ใช้ทันที และเข้าสู่ 2?`)) return;

  await updateAppStatusWithDataByUid(targetUid, "step_1_2_passed", {
    assignedRole: chosenRole,
    approvedRank: rankNumber,
    approvalNote: `แอดมินล็อคบทบาท ${chosenRole} (อันดับ ${rankNumber}) สำเร็จ เข้าสู่ 2`,
  });

  const modal = document.getElementById("appChoicesModal");
  if (modal) modal.style.display = "none";
  alert("✅ ล็อคบทบาทและเข้าสู่ 2 สำเร็จ!");
};

// ==========================================
// 1.2.5 การยื่นอุทธรณ์
// ==========================================
window.requestNewChoicesByUid = async function (targetUid) {
  const note = prompt("ระบุหมายเหตุแจ้งเตือนให้ผู้ใช้ไปยื่นอุทธรณ์เปลี่ยนบทบาทใหม่ในขั้นตอน 1.2.5:");
  if (note !== null) {
    await updateAppStatusWithDataByUid(targetUid, "step_1_2_5_revision", {
      revisionNote: note || "อันดับ 1-3 เต็มหมด กรุณายื่นอุทธรณ์เลือกบทบาทใหม่ใน 1.2.5",
      requiresNewChoices: true,
    });
    alert("✅ ส่งคำขอให้ผู้ใช้ไปดำเนินการอุทธรณ์ใน 1.2.5 เรียบร้อย!");
    const modal = document.getElementById("appChoicesModal");
    if (modal) modal.style.display = "none";
  }
};

window.adminReviewRoleByUid = async function (targetUid, actionType) {
  const proj = projects[currentProjectIndex];

  try {
    await runTransaction(db, async (transaction) => {
      const projRef = doc(db, "projects", proj.firebaseId);
      const projDoc = await transaction.get(projRef);
      if (!projDoc.exists()) throw new Error("ไม่พบโปรเจกต์นี้");

      const projData = projDoc.data();
      const apps = projData.applications || [];
      const appIndex = apps.findIndex(a => a.uid === targetUid);
      if (appIndex === -1) throw new Error("ไม่พบข้อมูลผู้สมัครรายนี้");

      const app = apps[appIndex];
      const appealRole = app.pendingAppealRole || app.selectedNewRole;

      if (actionType === "approve") {
        app.assignedRole = appealRole;
        app.status = "step_1_2_passed";
        app.appealStatus = "approved";
        delete app.pendingAppealRole;
        delete app.selectedNewRole;
        app.revisionNote = `แอดมินอนุมัติอุทธรณ์เปลี่ยนเป็นบทบาท: ${app.assignedRole} สำเร็จ (ส่งกลับไปเข้า 2)`;
      } else if (actionType === "reject") {
        app.status = "step_1_2_5_revision"; 
        app.appealStatus = "rejected";
        delete app.pendingAppealRole;
        delete app.selectedNewRole;
        app.revisionNote = `แอดมินปฏิเสธคำขออุทธรณ์บทบาท กรุณาเลือกบทบาทใหม่หรือขอยกเลิกการสมัคร`;
      }

      transaction.update(projRef, { applications: apps, updatedAt: serverTimestamp() });
    });

    window.renderApplicationsList();
    alert(actionType === "approve" ? "✅ อนุมัติอุทธรณ์บทบาทสำเร็จ!" : "❌ ปฏิเสธคำขออุทธรณ์เรียบร้อย!");
  } catch (err) {
    alert("เกิดข้อผิดพลาด: " + err.message);
  }
};

// ==========================================
// 1.9.5 การขอแก้ไขเอกสารรอบ 2
// ==========================================
window.approveEditRequestByUid = async function (targetUid) {
  if (!confirm("🔓 ต้องการอนุมัติคำขอแก้ไขเอกสารรอบ 2 (1.9.5) ให้ผู้ใช้หรือไม่?")) return;
  await updateAppStatusWithDataByUid(targetUid, "step_1_9_5_allowed", {
    revisionNote: "แอดมินอนุมัติคำขอแก้ไขเอกสารรอบ 2 แล้ว สามารถส่งข้อมูลกลับมาใหม่ใน 2 ได้",
  });
  alert("✅ อนุมัติสิทธิ์ให้ผู้ใช้แก้ไขเรียบร้อย!");
};

window.rejectEditRequestByUid = async function (targetUid) {
  const note = prompt("ระบุเหตุผลที่ไม่อนุมัติคำขอแก้ไข (1.9.5):");
  if (note !== null) {
    await updateAppStatusWithDataByUid(targetUid, "step_2_submitted", {
      editReason: null,
      revisionNote: `ไม่อนุมัติคำขอแก้ไขรอบ 2 (1.9.5): ${note}`,
    });
    alert("❌ ปฏิเสธคำขอแก้ไขเรียบร้อย");
  }
};

// ==========================================
// 2.1 ขั้นตอนยืนยันข้อมูล & ตีกลับไปขั้นตอน 2 ใหม่
// ==========================================
window.openRevisionPromptByUid = function (targetUid) {
  const note = prompt("ระบุจุดที่ต้องการตีกลับให้ผู้ใช้แก้ไขในรอบ 2:");
  if (note !== null) {
    updateAppStatusWithDataByUid(targetUid, "step_1_2_passed", {
      revisionNote: note || "ข้อมูลในรอบ 2 ไม่ถูกต้อง กรุณาแก้ไขและส่งข้อมูลใหม่ในขั้นตอนที่ 2",
      stage2Answers: null 
    });
    alert("🔄 ตีกลับข้อมูลไปยังขั้นตอนที่ 2 ให้ผู้ใช้แก้ไขเรียบร้อยแล้ว!");
  }
};

window.rejectApplicationCompletelyByUid = async function (targetUid) {
  if (confirm("⚠️ ต้องการปฏิเสธการสมัครของผู้สมัครรายนี้?")) {
    await updateAppStatusWithDataByUid(targetUid, "rejected", {
      approvalNote: "ปฏิเสธการสมัครเนื่องจากไม่ผ่านเกณฑ์",
    });
    const modal = document.getElementById("appChoicesModal");
    if (modal) modal.style.display = "none";
    alert("❌ ปฏิเสธการสมัครเรียบร้อย");
  }
};

window.openInterviewPrompt = function (targetUid) {
  selectedAppIndexForInterview = targetUid;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById("interviewDatetimeInput").value = tomorrow.toISOString().slice(0, 16);
  document.getElementById("interviewModal").classList.add("open");
};

window.closeInterviewModal = function () {
  document.getElementById("interviewModal").classList.remove("open");
  selectedAppIndexForInterview = null;
};

window.confirmInterviewSchedule = async function () {
  const dtInput = document.getElementById("interviewDatetimeInput").value;
  if (!dtInput) return alert("กรุณาเลือกวันเวลา");
  const [dPart, tPart] = dtInput.split("T");
  const [y, m, d] = dPart.split("-");
  if (selectedAppIndexForInterview !== null) {
    await updateAppStatusWithDataByUid(selectedAppIndexForInterview, "step_1_1_interview", {
      interviewDate: `${d}/${m}/${y} เวลา ${tPart} น.`,
    });
    window.closeInterviewModal();
  }
};

window.updateAppStatusByUid = async function (targetUid, newStatus) {
  await updateAppStatusWithDataByUid(targetUid, newStatus, {});
};

async function updateAppStatusWithDataByUid(targetUid, newStatus, additionalData) {
  const proj = projects[currentProjectIndex];
  const currentDateTime = new Date().toLocaleString("th-TH");

  try {
    await runTransaction(db, async (transaction) => {
      const projRef = doc(db, "projects", proj.firebaseId);
      const projDoc = await transaction.get(projRef);
      if (!projDoc.exists()) throw new Error("ไม่พบโปรเจกต์นี้");

      const projData = projDoc.data();
      const apps = projData.applications || [];
      const appIndex = apps.findIndex(a => a.uid === targetUid);
      if (appIndex === -1) throw new Error("ไม่พบข้อมูลผู้สมัครรายนี้");

      apps[appIndex] = {
        ...apps[appIndex],
        status: newStatus,
        ...additionalData,
        updatedAtString: currentDateTime,
      };

      transaction.update(projRef, {
        applications: apps,
        updatedAt: serverTimestamp(),
        updatedAtString: currentDateTime,
      });
    });

    window.renderApplicationsList();
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
}

window.closeAppModal = function () {
  document.getElementById("appModal").classList.remove("open");
};

// ==========================================
// 3. ขั้นตอนเข้าสู่โปรเจกต์แล้ว (บอร์ดโปรเจกต์)
// ==========================================
window.openProjectWindow3 = function (index) {
  currentProjectIndexForWindow3 = index;
  const proj = projects[index];
  document.getElementById("w3ProjTitle").innerText = `บอร์ดโปรเจกต์ (3): ${proj.name}`;
  document.getElementById("pNewsTitle").value = "";
  document.getElementById("pNewsContent").value = "";
  
  const searchInput = document.getElementById("projectMemberSearchInput");
  if (searchInput) searchInput.value = "";

  renderProjectNewsList();
  renderProjectMembersList();
  document.getElementById("projectWindow3Modal").classList.add("open");
};

window.closeProjectWindow3 = function () {
  document.getElementById("projectWindow3Modal").classList.remove("open");
  currentProjectIndexForWindow3 = null;
};

// เรนเดอร์รายการประกาศ (รองรับดีไซน์การ์ดลอย)
function renderProjectNewsList() {
  const proj = projects[currentProjectIndexForWindow3];
  const container = document.getElementById("projectNewsListContainer");
  if (!container) return;
  container.innerHTML = "";
  const pNews = proj.projectNews || [];

  if (pNews.length === 0) {
    container.innerHTML = '<p style="color:#6b7280; font-size:0.85rem; text-align:center; padding: 15px; font-style: italic;">ยังไม่มีประกาศในโปรเจกต์นี้</p>';
    const detailBox = document.getElementById("selectedNewsDetail");
    if (detailBox) {
      detailBox.innerHTML = '<span style="color: #6b7280; font-style: italic; display: flex; align-items: center; justify-content: center; height: 100%; min-height: 70px;">👉 คลิกเลือกประกาศจากรายการด้านบนเพื่อดูเนื้อหาเต็ม</span>';
    }
    return;
  }

  pNews.forEach((n, nIdx) => {
    container.innerHTML += `
      <div onclick="selectNewsDetail(${nIdx})" style="background: #15151c; padding: 10px 12px; border-radius: 6px; border: 1px solid #262636; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.borderColor='#ef4444'; this.style.background='#1a1a24'" onmouseout="this.style.borderColor='#262636'; this.style.background='#15151c'">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #fff; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;">📌 ${n.title}</strong>
          <button type="button" class="btn-secondary" style="background: rgba(220, 38, 38, 0.2); color: #ef4444; border: 1px solid rgba(220, 38, 38, 0.4); padding: 2px 8px; font-size: 0.7rem; border-radius: 4px;" onclick="event.stopPropagation(); deleteProjectNews(${nIdx})">ลบ</button>
        </div>
        <div style="font-size: 0.72rem; color: #9ca3af; margin-top: 3px;">🕒 ${n.date || "-"}</div>
      </div>
    `;
  });

  if (pNews.length > 0) {
    selectNewsDetail(0);
  }
}

// ฟังก์ชันคลิกแสดงรายละเอียดในการ์ดลอย
window.selectNewsDetail = function(newsIdx) {
  const proj = projects[currentProjectIndexForWindow3];
  if (!proj || !proj.projectNews) return;
  const newsItem = proj.projectNews[newsIdx];
  const detailBox = document.getElementById("selectedNewsDetail");
  if (!detailBox || !newsItem) return;

  detailBox.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; border-bottom: 1px solid #222230; padding-bottom: 6px;">
      <strong style="color: #fff; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">📌 ${newsItem.title}</strong>
      <span style="font-size: 0.7rem; color: #9ca3af; background: #1f1f2e; padding: 2px 6px; border-radius: 4px;">📅 ${newsItem.date || "-"}</span>
    </div>
    <p style="color: #d1d5db; margin: 0; white-space: pre-line; line-height: 1.5; font-size: 0.88rem;">${newsItem.content}</p>
  `;
};

window.handleSaveProjectNews = async function (e) {
  e.preventDefault();
  if (currentProjectIndexForWindow3 === null) return;
  const proj = projects[currentProjectIndexForWindow3];
  const title = document.getElementById("pNewsTitle").value.trim();
  const content = document.getElementById("pNewsContent").value.trim();
  if (!title || !content) return;

  const pNews = proj.projectNews || [];
  const currentDateTime = new Date().toLocaleString("th-TH");
  pNews.unshift({ title, content, date: currentDateTime });

  try {
    await updateDoc(doc(db, "projects", proj.firebaseId), {
      projectNews: pNews,
      updatedAt: serverTimestamp(),
      updatedAtString: currentDateTime,
    });
    document.getElementById("pNewsTitle").value = "";
    document.getElementById("pNewsContent").value = "";
    renderProjectNewsList();
    alert("✅ ส่งประกาศเฉพาะกลุ่มใน 3 สำเร็จ!");
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
};

window.deleteProjectNews = async function (newsIdx) {
  const proj = projects[currentProjectIndexForWindow3];
  proj.projectNews.splice(newsIdx, 1);
  const currentDateTime = new Date().toLocaleString("th-TH");
  try {
    await updateDoc(doc(db, "projects", proj.firebaseId), {
      projectNews: proj.projectNews,
      updatedAt: serverTimestamp(),
      updatedAtString: currentDateTime,
    });
    renderProjectNewsList();
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
};

// เรนเดอร์รายชื่อสมาชิก พร้อมระบบค้นหา (Search)
window.renderProjectMembersList = function () {
  const proj = projects[currentProjectIndexForWindow3];
  const container = document.getElementById("projectMembersListContainer");
  if (!container) return;
  container.innerHTML = "";

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
    container.innerHTML = '<p style="color:#888; font-size:0.85rem; text-align:center; padding: 20px;">ไม่พบรายชื่อสมาชิกที่ค้นหา</p>';
    return;
  }

  filteredMembers.forEach((m) => {
    container.innerHTML += `
      <div style="background:#181818; padding:10px; border-radius:4px; display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; border: 1px solid #222;">
        <div>
          <strong style="color: #fff;">${m.user || "ไม่ระบุ"}</strong> 
          <span style="color:#28a745; font-size:0.8rem; background: rgba(40,167,69,0.15); padding: 2px 6px; border-radius: 4px;">(${m.assignedRole || "สมาชิก"})</span>
          <div style="font-size:0.75rem; color:#aaa; margin-top: 3px;">📧 ${m.accountEmail || "-"}</div>
        </div>
        <button class="btn-secondary" style="background:#c9302c; padding:4px 10px; font-size:0.75rem; border-radius: 4px; cursor: pointer;" onclick="removeMemberFromProjectByUid('${m.uid}')">ปลดออก</button>
      </div>
    `;
  });
};

window.removeMemberFromProjectByUid = async function (targetUid) {
  if (!confirm("⚠️ ต้องการปลดสมาชิกออกจากโปรเจกต์และคืนโควตาใช่หรือไม่?")) return;
  const proj = projects[currentProjectIndexForWindow3];
  const currentDateTime = new Date().toLocaleString("th-TH");

  try {
    await runTransaction(db, async (transaction) => {
      const projRef = doc(db, "projects", proj.firebaseId);
      const projDoc = await transaction.get(projRef);
      if (!projDoc.exists()) throw new Error("ไม่พบโปรเจกต์นี้");

      const projData = projDoc.data();
      const apps = projData.applications || [];
      const appIndex = apps.findIndex(a => a.uid === targetUid);
      if (appIndex === -1) throw new Error("ไม่พบสมาชิกรายนี้");

      apps[appIndex].status = "rejected";
      apps[appIndex].updatedAtString = currentDateTime;

      transaction.update(projRef, {
        applications: apps,
        updatedAt: serverTimestamp(),
        updatedAtString: currentDateTime,
      });
    });

    renderProjectMembersList();
    alert("✅ ปลดสมาชิกสำเร็จ!");
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
};

// ==========================================
// 5. GLOBAL NEWS & SEARCH
// ==========================================
window.renderNews = function() {
  const container = document.getElementById("newsList");
  if (!container) return;

  const searchNewsInput = document.getElementById("adminNewsSearch");
  const keyword = searchNewsInput ? searchNewsInput.value.toLowerCase().trim() : "";
  container.innerHTML = "";

  if (news.length === 0) {
    container.innerHTML = '<p style="color:#888; text-align:center;">ยังไม่มีข่าวสารในระบบ</p>';
    return;
  }

  const filteredNews = news.filter(n => {
    const title = (n.title || "").toLowerCase();
    const content = (n.content || "").toLowerCase();
    return title.includes(keyword) || content.includes(keyword);
  });

  if (filteredNews.length === 0) {
    container.innerHTML = '<p style="color:#888; text-align:center;">ไม่พบข่าวสารที่ค้นหา</p>';
    return;
  }

  filteredNews.forEach((n) => {
    const index = news.indexOf(n);
    let imagesHtml = "";
    if (n.imageUrl) {
      const urls = n.imageUrl.split(/[\n,]+/).map(u => u.trim()).filter(u => u.length > 0);
      if (urls.length > 0) {
        let imgsGrid = "";
        urls.forEach(url => {
          imgsGrid += `<div style="flex: 0 0 120px; height: 90px; border-radius: 4px; overflow: hidden; background: #000; border: 1px solid #333;"><img src="${url}" alt="News Image" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.style.display='none'"/></div>`;
        });
        imagesHtml = `<div style="display: flex; gap: 8px; overflow-x: auto; margin-top: 8px; margin-bottom: 8px; padding-bottom: 4px;">${imgsGrid}</div>`;
      }
    }

    container.innerHTML += `
      <div class="news-card" style="background:#181818; border:1px solid #333; padding:12px; border-radius:6px; margin-bottom:10px;">
        <h4>${n.title}</h4>
        <p style="color:#aaa; font-size:0.85rem; margin:4px 0;">${n.content}</p>
        ${imagesHtml}
        <div style="font-size:0.75rem; color:#777; margin-top:6px;">
          📅 วันที่ประกาศ: ${n.date || "-"} 
        </div>
        <div style="display: flex; gap: 6px; margin-top: 8px;">
          <button class="btn-secondary" style="background:#f0ad4e; color:#000; padding:4px 8px; font-size:0.8rem;" onclick="editNews(${index})">✏️ แก้ไข</button>
          <button class="btn-secondary" style="background:#c9302c; padding:4px 8px; font-size:0.8rem;" onclick="deleteNews(${index})">🗑️ ลบ</button>
        </div>
      </div>
    `;
  });
};

window.openNewsModal = function () {
  document.getElementById("newsModalTitle").innerText = "สร้างข่าวสารใหม่";
  document.getElementById("newsId").value = "";
  document.getElementById("newsTitle").value = "";
  document.getElementById("newsContent").value = "";
  const imgInput = document.getElementById("newsImageUrl");
  if (imgInput) imgInput.value = "";
  document.getElementById("newsModal").classList.add("open");
};

window.editNews = function (index) {
  const n = news[index];
  document.getElementById("newsModalTitle").innerText = "แก้ไขข่าวสาร";
  document.getElementById("newsId").value = index;
  document.getElementById("newsTitle").value = n.title || "";
  document.getElementById("newsContent").value = n.content || "";
  const imgInput = document.getElementById("newsImageUrl");
  if (imgInput) imgInput.value = n.imageUrl || "";
  document.getElementById("newsModal").classList.add("open");
};

window.closeNewsModal = function () {
  document.getElementById("newsModal").classList.remove("open");
};

window.handleSaveNews = async function (e) {
  e.preventDefault();
  const index = document.getElementById("newsId").value;
  const title = document.getElementById("newsTitle").value.trim();
  const content = document.getElementById("newsContent").value.trim();
  const imgInput = document.getElementById("newsImageUrl");
  const imageUrl = imgInput ? imgInput.value.trim() : "";
  const currentDateTime = new Date().toLocaleString("th-TH");

  try {
    if (index !== "") {
      await updateDoc(doc(db, "news", news[index].firebaseId), {
        title, content, imageUrl, updatedAtString: currentDateTime,
      });
    } else {
      await addDoc(collection(db, "news"), {
        title, content, imageUrl, date: currentDateTime, createdAt: serverTimestamp(),
      });
    }
    window.closeNewsModal();
    alert("✅ บันทึกข่าวสารสำเร็จ!");
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
};

window.deleteNews = async function (index) {
  if (confirm("ยืนยันลบข่าวสารนี้?")) {
    try {
      await deleteDoc(doc(db, "news", news[index].firebaseId));
      alert("✅ ลบข่าวสารสำเร็จ!");
    } catch (err) {
      alert("❌ เกิดข้อผิดพลาด: " + err.message);
    }
  }
};

// ==========================================
// 6. USERS MANAGEMENT & SEARCH
// ==========================================
window.renderUsers = function() {
  const tbody = document.getElementById("userTable") || document.getElementById("userTableBody");
  if (!tbody) return;

  const searchUserInput = document.getElementById("adminUserSearch");
  const keyword = searchUserInput ? searchUserInput.value.toLowerCase().trim() : "";
  tbody.innerHTML = "";

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">ยังไม่มีข้อมูลผู้ใช้ในระบบ</td></tr>';
    return;
  }

  const filteredUsers = users.filter(u => {
    const name = (u.nickname || u.name || "").toLowerCase();
    const email = (u.email || "").toLowerCase();
    return name.includes(keyword) || email.includes(keyword);
  });

  if (filteredUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">ไม่พบข้อมูลผู้ใช้ที่ค้นหา</td></tr>';
    return;
  }

  filteredUsers.forEach((u) => {
    const isBanned = u.status === "Banned";
    tbody.innerHTML += `
      <tr>
        <td>${u.nickname || u.name || "-"}</td>
        <td>${u.email || "-"}</td>
        <td><span style="color:${isBanned ? "#ff2a2a" : "#28a745"}">${u.status || "Active"}</span></td>
        <td>
          <button class="btn-secondary" style="background:${isBanned ? "#28a745" : "#f0ad4e"}; color:${isBanned ? "#fff" : "#000"}; padding:3px 8px; font-size:0.8rem;" onclick="toggleBanUser('${u.firebaseId}')">${isBanned ? "ปลดแบน" : "แบน"}</button>
          <button class="btn-secondary" style="background:#c9302c; padding:3px 8px; font-size:0.8rem;" onclick="deleteUser('${u.firebaseId}')">ลบ</button>
        </td>
      </tr>
    `;
  });
};

window.toggleBanUser = async function (firebaseId) {
  const u = users.find(item => item.firebaseId === firebaseId);
  if (!u) return;
  const newStatus = u.status === "Banned" ? "Active" : "Banned";
  if (confirm(`ยืนยันเปลี่ยนสถานะผู้ใช้เป็น "${newStatus}"?`)) {
    try {
      await updateDoc(doc(db, "users", u.firebaseId), { status: newStatus });
      alert("✅ อัปเดตสถานะผู้ใช้สำเร็จ!");
    } catch (err) {
      alert("❌ เกิดข้อผิดพลาด: " + err.message);
    }
  }
};

window.deleteUser = async function (firebaseId) {
  const u = users.find(item => item.firebaseId === firebaseId);
  if (!u) return;
  if (confirm("ยืนยันลบผู้ใช้?")) {
    try {
      await deleteDoc(doc(db, "users", u.firebaseId));
      alert("✅ ลบผู้ใช้สำเร็จ!");
    } catch (err) {
      alert("❌ เกิดข้อผิดพลาด: " + err.message);
    }
  }
}; 
