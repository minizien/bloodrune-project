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
// 🛡️ ตรวจสอบสิทธิ์แอดมินก่อนเข้าใช้งาน
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

    if (!userDocSnap.exists()) {
      alert("❌ ไม่พบข้อมูลบัญชีผู้ใช้นี้ในระบบ");
      window.location.href = "Lobby.html";
      return;
    }

    const userData = userDocSnap.data();
    const roleUser = userData.RoleUser || "";

    if (roleUser.toLowerCase() !== "admin" && userData.isAdmin !== true) {
      alert("❌ คุณไม่มีสิทธิ์เข้าถึงหน้าผู้ดูแลระบบ (สำหรับ Admin เท่านั้น)");
      window.location.href = "Lobby.html";
      return;
    }

    initAdminPanel();
  } catch (err) {
    console.error("Auth verification error:", err);
    alert("❌ เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์");
    window.location.href = "Lobby.html";
  }
});

function isCountedAsPassed(status) {
  const countedStatuses = [
    "passed",
    "stage2_submitted",
    "revision_requested",
    "edit_requested",
    "edit_allowed",
    "edit_approved",
    "approved",
    "completed"
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

function initAdminPanel() {
  onSnapshot(collection(db, "projects"), (snapshot) => {
    projects = [];
    snapshot.forEach((docSnap) => {
      projects.push({ firebaseId: docSnap.id, ...docSnap.data() });
    });
    renderProjects();
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
// 1. PROJECT SYSTEM & 3 WINDOWS MANAGEMENT
// ==========================================
function renderProjects() {
  const container = document.getElementById("projectList");
  if (!container) return;
  container.innerHTML = "";

  if (projects.length === 0) {
    container.innerHTML =
      '<p style="color:#888; grid-column: 1/-1; text-align:center;">ยังไม่มีโปรเจกต์ในระบบ Firebase</p>';
    return;
  }

  projects.forEach((proj, index) => {
    const isHidden = proj.hidden === true || proj.hidden === "true";
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
      <span class="card-status ${isHidden ? "status-hidden" : "status-active"}">
        ${isHidden ? "🔒 ซ่อนอยู่" : "🌐 เปิดรับสมัคร"}
      </span>
      <h4 class="card-title">${proj.name}</h4>${descHtml}
      <div class="card-info">
        <p><strong>ความจุ:</strong> ทั้งหมด ${proj.maxMembers} คน | ผ่านแล้ว <span style="color:#28a745; font-weight:bold;">${approvedCount}</span> คน | เหลือ <span style="color:#ff2a2a; font-weight:bold;">${remainingSeats}</span> ที่</p>
        <p style="margin-top:6px;"><strong>สถานะบทบาท:</strong></p>
        <ul style="padding-left: 15px; font-size: 0.85rem; color: #ccc;">${rolesHtml}</ul>
      </div>
      <div class="card-actions" style="margin-top: 10px;">
        <button class="btn-secondary" onclick="editProject(${index})" style="background:#2a2a2a;">⚙️ 1. ตั้งค่าโปรเจกต์</button>
        <button class="btn-secondary" onclick="openStage2Config(${index})" style="background:#17a2b8;">📝 2. ฟอร์มรอบ 2</button>
        <button class="btn-secondary" onclick="openProjectWindow3(${index})" style="background:#28a745;">📢 3. บอร์ดประกาศ</button>
        <button class="btn-secondary" onclick="viewApps(${index})">📋 ประวัติผู้สมัคร (${proj.applications ? proj.applications.length : 0})</button>
        <button class="btn-secondary" style="background: #c9302c;" onclick="deleteProject(${index})">🗑️ ลบ</button>
      </div>
    `;
    container.appendChild(card);
  });
}

window.openProjectModal = function () {
  document.getElementById("projectModalTitle").innerText = "สร้างโปรเจกต์ใหม่";
  document.getElementById("projId").value = "";
  document.getElementById("projName").value = "";
  document.getElementById("projImageUrl").value = "";
  document.getElementById("projDescription").value = "";
  document.getElementById("projMaxMembers").value = "";
  document.getElementById("projHidden").value = "true";
  document.getElementById("roleInputsContainer").innerHTML = "";
  document.getElementById("customQuestionsContainer").innerHTML = "";
  window.addRoleInput();
  window.addQuestionInput("วันเดือนปีเกิด", "date");
  window.addQuestionInput("อีเมลติดต่อกลับ", "email");
  window.addQuestionInput("เหตุผลที่สนใจเข้าร่วมโปรเจกต์", "textarea");
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

window.addQuestionInput = function (qText = "", qType = "text") {
  const container = document.getElementById("customQuestionsContainer");
  const div = document.createElement("div");
  div.className = "question-row";
  div.innerHTML = `
    <input type="text" placeholder="หัวข้อคำถาม" class="question-title" value="${qText}" required style="flex:2;" />
    <select class="question-type" style="flex:1;">
      <option value="text" ${qType === "text" ? "selected" : ""}>ข้อความสั้น</option>
      <option value="textarea" ${qType === "textarea" ? "selected" : ""}>ข้อความยาว</option>
      <option value="number" ${qType === "number" ? "selected" : ""}>ตัวเลข</option>
      <option value="date" ${qType === "date" ? "selected" : ""}>วันที่</option>
      <option value="email" ${qType === "email" ? "selected" : ""}>อีเมล</option>
    </select>
    <button type="button" onclick="this.parentElement.remove()" style="background:#ff2a2a; color:#fff; border:none; padding:0 10px; border-radius:4px; cursor:pointer;">✕</button>
  `;
  container.appendChild(div);
};

window.handleSaveProject = async function (e) {
  e.preventDefault();
  const index = document.getElementById("projId").value;
  const name = document.getElementById("projName").value.trim();
  const imageUrl = document.getElementById("projImageUrl").value.trim();
  const description = document.getElementById("projDescription").value.trim();
  const maxMembers = Number(document.getElementById("projMaxMembers").value);
  const hidden = document.getElementById("projHidden").value === "true";

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

  if (totalRolesCount > maxMembers) {
    document.getElementById("roleError").style.display = "block";
    return;
  }
  document.getElementById("roleError").style.display = "none";

  const qTitles = document.querySelectorAll(".question-title");
  const qTypes = document.querySelectorAll(".question-type");
  let customQuestions = [];
  for (let i = 0; i < qTitles.length; i++) {
    const title = qTitles[i].value.trim();
    const type = qTypes[i].value;
    if (title !== "") customQuestions.push({ title, type });
  }

  const currentDateTime = new Date().toLocaleString("th-TH");
  const projData = {
    name,
    imageUrl,
    description,
    maxMembers,
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
        { title: "ลิงก์ช่องทางติดต่อเพิ่มเติม (Discord / Facebook)", type: "text" },
        { title: "ประสบการณ์การทำงาน (ปี)", type: "number" },
        { title: "แนบลิงก์ภาพผลงาน / รูปเอกสาร", type: "image" },
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
  document.getElementById("projImageUrl").value = proj.imageUrl || "";
  document.getElementById("projDescription").value = proj.description || "";
  document.getElementById("projMaxMembers").value = proj.maxMembers;
  document.getElementById("projHidden").value = proj.hidden ? "true" : "false";

  const roleContainer = document.getElementById("roleInputsContainer");
  roleContainer.innerHTML = "";
  if (proj.roles)
    proj.roles.forEach((r) => window.addRoleInput(r.name, r.count));

  const qContainer = document.getElementById("customQuestionsContainer");
  qContainer.innerHTML = "";
  if (proj.customQuestions)
    proj.customQuestions.forEach((q) =>
      window.addQuestionInput(q.title, q.type),
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
// 2. STAGE 2 CONFIG (WINDOW 2)
// ==========================================
window.openStage2Config = function (index) {
  currentProjectIndexForStage2Config = index;
  const proj = projects[index];
  document.getElementById("stage2Description").value = proj.stage2Description || "";

  const container = document.getElementById("stage2QuestionsContainer");
  container.innerHTML = "";
  const s2Questions = proj.stage2Questions || [];
  if (s2Questions.length > 0) {
    s2Questions.forEach((q) => window.addStage2QuestionInput(q.title, q.type));
  } else {
    window.addStage2QuestionInput();
  }
  document.getElementById("stage2ConfigModal").classList.add("open");
};

window.closeStage2ConfigModal = function () {
  document.getElementById("stage2ConfigModal").classList.remove("open");
  currentProjectIndexForStage2Config = null;
};

window.addStage2QuestionInput = function (qText = "", qType = "text") {
  const container = document.getElementById("stage2QuestionsContainer");
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "margin-bottom:12px; background:#181818; padding:10px; border-radius:6px; border:1px solid #333;";
  wrapper.innerHTML = `
    <div style="margin-bottom: 6px;">
      <label style="font-size: 0.85rem; color: #17a2b8; font-weight: bold; display: block; margin-bottom: 4px;">หัวข้อคำถาม:</label>
      <input type="text" class="s2-q-title" value="${qText}" required style="width: 100%; padding: 8px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px;" />
    </div>
    <div style="display: flex; gap: 8px; align-items: center;">
      <select class="s2-q-type" style="flex: 1; padding: 6px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px;">
        <option value="text" ${qType === "text" ? "selected" : ""}>ข้อความสั้น</option>
        <option value="textarea" ${qType === "textarea" ? "selected" : ""}>ข้อความยาว</option>
        <option value="number" ${qType === "number" ? "selected" : ""}>ตัวเลข</option>
        <option value="date" ${qType === "date" ? "selected" : ""}>วันที่</option>
        <option value="email" ${qType === "email" ? "selected" : ""}>อีเมล</option>
        <option value="image" ${qType === "image" ? "selected" : ""}>📷 รูปภาพ</option>
      </select>
      <button type="button" onclick="this.closest('div').parentElement.remove()" style="background:#ff2a2a; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">✕ ลบ</button>
    </div>
  `;
  container.appendChild(wrapper);
};

window.handleSaveStage2Config = async function (e) {
  e.preventDefault();
  if (currentProjectIndexForStage2Config === null) return;
  const proj = projects[currentProjectIndexForStage2Config];
  const stage2Description = document.getElementById("stage2Description").value.trim();
  const titles = document.querySelectorAll(".s2-q-title");
  const types = document.querySelectorAll(".s2-q-type");
  let stage2Questions = [];
  for (let i = 0; i < titles.length; i++) {
    if (titles[i].value.trim()) {
      stage2Questions.push({ title: titles[i].value.trim(), type: types[i].value });
    }
  }
  try {
    await updateDoc(doc(db, "projects", proj.firebaseId), { stage2Description, stage2Questions });
    window.closeStage2ConfigModal();
    alert("✅ บันทึกรูปแบบฟอร์มรอบสองสำเร็จ!");
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
};

// ==========================================
// 3. APPLICATIONS & 1.9.5 MANAGEMENT
// ==========================================
window.viewApps = function (index) {
  currentProjectIndex = index;
  document.getElementById("appSearchInput").value = "";
  document.getElementById("appStatusFilter").value = "all";
  window.renderApplicationsList();
  document.getElementById("appModal").classList.add("open");
};

window.renderApplicationsList = function () {
  if (currentProjectIndex === null) return;
  const proj = projects[currentProjectIndex];
  const container = document.getElementById("appListContent");
  container.innerHTML = `<h4>โปรเจกต์: ${proj.name}</h4><br>`;

  if (!proj.applications || proj.applications.length === 0) {
    container.innerHTML += '<p style="color:#888;">ยังไม่มีประวัติผู้สมัคร</p>';
    return;
  }

  const searchTerm = document.getElementById("appSearchInput").value.toLowerCase().trim();
  const statusFilter = document.getElementById("appStatusFilter").value;
  const sortedApps = [...proj.applications].reverse();

  sortedApps.forEach((app, originalReverseIndex) => {
    const appIndex = proj.applications.length - 1 - originalReverseIndex;
    const appStatus = app.status || "pending";

    if (statusFilter !== "all" && appStatus !== statusFilter) return;
    if (searchTerm && !(app.user || "").toLowerCase().includes(searchTerm) && !(app.accountEmail || "").toLowerCase().includes(searchTerm)) return;

    let round1Html = "";
    if (app.answers) {
      for (const [q, a] of Object.entries(app.answers)) {
        round1Html += `<p style="margin:2px 0; font-size:0.85rem;">• ${q}: <span style="color:#ddd;">${a || "-"}</span></p>`;
      }
    }

    let round2Html = '<p style="color:#666; font-size:0.85rem;">ยังไม่ได้ส่งข้อมูลรอบ 2</p>';
    if (app.stage2Answers) {
      round2Html = "";
      for (const [q, a] of Object.entries(app.stage2Answers)) {
        round2Html += `<p style="margin:2px 0; font-size:0.85rem;">• ${q}: <span style="color:#ddd;">${a || "-"}</span></p>`;
      }
    }

    let statusBadge = '<span class="badge-status status-pending">1. สมัครเข้ามา</span>';
    if (appStatus === "interview") statusBadge = '<span class="badge-status status-interview">นัดหมายสัมภาษณ์</span>';
    if (appStatus === "passed") statusBadge = '<span class="badge-status status-passed">ผ่านรอบ 1 (รอส่งรอบ 2)</span>';
    if (appStatus === "stage2_submitted") statusBadge = '<span class="badge-status" style="background:#17a2b8; color:#fff;">ส่งข้อมูลรอบ 2 แล้ว (รอตรวจ)</span>';
    if (appStatus === "revision_requested") statusBadge = '<span class="badge-status" style="background:#f0ad4e; color:#000;">🔄 ตีกลับให้แก้ไขรอบ 2</span>';
    if (appStatus === "edit_requested") statusBadge = '<span class="badge-status" style="background:#f0ad4e; color:#000;">🔄 ขอแก้ไขข้อมูล (1.9.5)</span>';
    if (appStatus === "edit_allowed") statusBadge = '<span class="badge-status" style="background:#28a745; color:#fff;">🔓 อนุญาตให้แก้ไขแล้ว</span>';
    if (appStatus === "approved") statusBadge = `<span class="badge-status status-approved">🎯 เข้าโปรเจกต์แล้ว (${app.assignedRole || "ทีมงาน"})</span>`;
    if (appStatus === "rejected") statusBadge = '<span class="badge-status status-rejected">❌ ไม่ผ่าน</span>';

    let actionButtons = "";
    if (appStatus === "pending") {
      actionButtons = `<button class="btn-secondary" style="background:#f0ad4e; color:#000;" onclick="openInterviewPrompt(${appIndex})">📅 นัดสัมภาษณ์</button>`;
    } else if (appStatus === "interview") {
      actionButtons = `<button class="btn-secondary" style="background:#17a2b8;" onclick="updateAppStatus(${appIndex}, 'passed')">✅ ผ่านรอบ 1</button>`;
    } else if (appStatus === "stage2_submitted") {
      actionButtons = `
        <button class="btn-secondary" style="background:#28a745;" onclick="updateAppStatus(${appIndex}, 'approved')">🎯 อนุมัติเข้าโปรเจกต์</button>
        <button class="btn-secondary" style="background:#f0ad4e; color:#000;" onclick="openRevisionPrompt(${appIndex})">🔄 ตีกลับรอบ 2 ให้แก้ไข</button>
      `;
    } else if (appStatus === "edit_requested") {
      actionButtons = `
        <button class="btn-secondary" style="background:#28a745;" onclick="approveEditRequest(${appIndex})">🔓 อนุมัติสิทธิ์ให้แก้ไข (1.9.5)</button>
        <button class="btn-secondary" style="background:#c9302c;" onclick="rejectEditRequest(${appIndex})">❌ ไม่อนุมัติคำขอแก้</button>
      `;
    } else if (appStatus === "edit_allowed") {
      actionButtons = `<span style="font-size:0.85rem; color:#28a745;">⏳ กำลังรอผู้สมัครแก้ไขข้อมูล...</span>`;
    }

    container.innerHTML += `
      <div class="app-item" style="background:#141414; border:1px solid #333; padding:12px; border-radius:6px; margin-bottom:10px;">
        <div><strong>👤 ${app.user || "ไม่ระบุชื่อ"}</strong> ${statusBadge}</div>
        <div style="font-size:0.8rem; color:#aaa; margin:4px 0;">📧 ${app.accountEmail || "-"}</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <div style="background:#1c1c1c; padding:8px; border-radius:4px;"><p style="color:#ff2a2a; font-size:0.8rem; font-weight:bold;">รอบที่ 1:</p>${round1Html}</div>
          <div style="background:#1c1c1c; padding:8px; border-radius:4px;"><p style="color:#17a2b8; font-size:0.8rem; font-weight:bold;">รอบที่ 2:</p>${round2Html}</div>
        </div>
        ${app.editReason ? `<p style="font-size:0.85rem; color:#f0ad4e; margin-top:6px;">🔄 เหตุผลขอแก้ (1.9.5): ${app.editReason}</p>` : ""}
        ${app.revisionNote ? `<p style="font-size:0.85rem; color:#f0ad4e; margin-top:6px;">💬 หมายเหตุแอดมิน: ${app.revisionNote}</p>` : ""}
        <div style="display:flex; gap:6px; margin-top:10px; flex-wrap:wrap;">${actionButtons}</div>
      </div>
    `;
  });
};

window.approveEditRequest = async function (appIndex) {
  await updateAppStatusWithData(appIndex, "edit_allowed", {
    revisionNote: "แอดมินอนุมัติสิทธิ์ให้แก้ไขเอกสารรอบ 2 แล้ว",
  });
  alert("✅ อนุญาตให้ผู้สมัครแก้ไขข้อมูลเรียบร้อย!");
};

window.rejectEditRequest = async function (appIndex) {
  const note = prompt("ระบุเหตุผลที่ไม่อนุญาตให้แก้ไขข้อมูล (1.9.5):");
  if (note !== null) {
    await updateAppStatusWithData(appIndex, "stage2_submitted", {
      editReason: null,
      revisionNote: `ไม่อนุมัติคำขอแก้ไข (1.9.5): ${note}`,
    });
  }
};

window.openRevisionPrompt = function (appIndex) {
  const note = prompt("ระบุจุดที่ต้องการให้ผู้สมัครแก้ไขในฟอร์มรอบที่ 2:");
  if (note !== null) {
    updateAppStatusWithData(appIndex, "revision_requested", { revisionNote: note || "กรุณาแก้ไขข้อมูล" });
  }
};

window.openInterviewPrompt = function (appIndex) {
  selectedAppIndexForInterview = appIndex;
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
    await updateAppStatusWithData(selectedAppIndexForInterview, "interview", {
      interviewDate: `${d}/${m}/${y} เวลา ${tPart} น.`,
    });
    window.closeInterviewModal();
  }
};

window.updateAppStatus = async function (appIndex, newStatus) {
  await updateAppStatusWithData(appIndex, newStatus, {});
};

async function updateAppStatusWithData(appIndex, newStatus, additionalData) {
  const proj = projects[currentProjectIndex];
  const currentDateTime = new Date().toLocaleString("th-TH");
  proj.applications[appIndex] = {
    ...proj.applications[appIndex],
    status: newStatus,
    ...additionalData,
    updatedAtString: currentDateTime,
  };
  try {
    await updateDoc(doc(db, "projects", proj.firebaseId), {
      applications: proj.applications,
      updatedAt: serverTimestamp(),
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
// 4. WINDOW 3 - PROJECT NEWS & MEMBERS
// ==========================================
window.openProjectWindow3 = function (index) {
  currentProjectIndexForWindow3 = index;
  renderProjectNewsList();
  renderProjectMembersList();
  document.getElementById("projectWindow3Modal").classList.add("open");
};

window.closeProjectWindow3 = function () {
  document.getElementById("projectWindow3Modal").classList.remove("open");
  currentProjectIndexForWindow3 = null;
};

function renderProjectNewsList() {
  const proj = projects[currentProjectIndexForWindow3];
  const container = document.getElementById("projectNewsListContainer");
  container.innerHTML = "";
  (proj.projectNews || []).forEach((n, nIdx) => {
    container.innerHTML += `
      <div style="background:#181818; padding:8px; border-radius:4px; margin-bottom:6px;">
        <strong>${n.title}</strong>
        <p style="font-size:0.85rem; color:#aaa;">${n.content}</p>
        <button class="btn-secondary" style="background:#c9302c; padding:2px 6px; font-size:0.75rem;" onclick="deleteProjectNews(${nIdx})">ลบข่าว</button>
      </div>
    `;
  });
}

window.handleSaveProjectNews = async function (e) {
  e.preventDefault();
  if (currentProjectIndexForWindow3 === null) return;
  const proj = projects[currentProjectIndexForWindow3];
  const title = document.getElementById("pNewsTitle").value.trim();
  const content = document.getElementById("pNewsContent").value.trim();
  if (!title || !content) return;

  const pNews = proj.projectNews || [];
  pNews.unshift({ title, content, date: new Date().toLocaleString("th-TH") });
  try {
    await updateDoc(doc(db, "projects", proj.firebaseId), { projectNews: pNews });
    document.getElementById("pNewsTitle").value = "";
    document.getElementById("pNewsContent").value = "";
    renderProjectNewsList();
    alert("✅ ส่งประกาศสำเร็จ!");
  } catch (err) {
    alert("❌ เกิดข้อผิดพลาด: " + err.message);
  }
};

window.deleteProjectNews = async function (newsIdx) {
  const proj = projects[currentProjectIndexForWindow3];
  proj.projectNews.splice(newsIdx, 1);
  await updateDoc(doc(db, "projects", proj.firebaseId), { projectNews: proj.projectNews });
  renderProjectNewsList();
};

function renderProjectMembersList() {
  const proj = projects[currentProjectIndexForWindow3];
  const container = document.getElementById("projectMembersListContainer");
  container.innerHTML = "";
  (proj.applications ? proj.applications.filter((a) => isCountedAsPassed(a.status)) : []).forEach((m) => {
    const realIndex = proj.applications.findIndex((item) => item.uid === m.uid && item.accountEmail === m.accountEmail);
    container.innerHTML += `
      <div style="background:#181818; padding:8px; border-radius:4px; display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <div><strong>${m.user || "ไม่ระบุ"}</strong> <span style="color:#28a745; font-size:0.8rem;">(${m.assignedRole || "สมาชิก"})</span></div>
        <button class="btn-secondary" style="background:#c9302c; padding:3px 8px; font-size:0.75rem;" onclick="removeMemberFromProject(${realIndex})">ปลดออก</button>
      </div>
    `;
  });
}

window.removeMemberFromProject = async function (appIndex) {
  if (!confirm("⚠️ ต้องการปลดสมาชิกออกใช่หรือไม่?")) return;
  const proj = projects[currentProjectIndexForWindow3];
  proj.applications[appIndex].status = "rejected";
  await updateDoc(doc(db, "projects", proj.firebaseId), { applications: proj.applications });
  renderProjectMembersList();
  alert("✅ ปลดสมาชิกสำเร็จ!");
};

// ==========================================
// 5. GLOBAL NEWS SYSTEM (จัดการข่าวสารส่วนกลาง)
// ==========================================
function renderNews() {
  const container = document.getElementById("newsList");
  if (!container) return;
  container.innerHTML = "";

  if (news.length === 0) {
    container.innerHTML = '<p style="color:#888; text-align:center;">ยังไม่มีข่าวสารในระบบ</p>';
    return;
  }

  news.forEach((n, index) => {
    let imagesHtml = "";
    if (n.imageUrl) {
      const urls = n.imageUrl.split(/[\n,]+/).map(u => u.trim()).filter(u => u.length > 0);
      if (urls.length > 0) {
        let imgsGrid = "";
        urls.forEach(url => {
          imgsGrid += `<div style="flex: 0 0 100px; height: 75px; border-radius: 4px; overflow: hidden; background: #000; border: 1px solid #333;"><img src="${url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.style.display='none'"/></div>`;
        });
        imagesHtml = `<div style="display: flex; gap: 6px; overflow-x: auto; margin-top: 6px; margin-bottom: 6px;">${imgsGrid}</div>`;
      }
    }

    container.innerHTML += `
      <div class="news-card" style="background:#181818; border:1px solid #333; padding:12px; border-radius:6px; margin-bottom:10px;">
        <h4>${n.title}</h4>
        <p style="color:#aaa; font-size:0.85rem; margin:4px 0;">${n.content}</p>
        ${imagesHtml}
        <div style="font-size:0.75rem; color:#777; margin-top:6px;">📅 ${n.date || "-"}</div>
        <div style="display: flex; gap: 6px; margin-top: 8px;">
          <button class="btn-secondary" style="background:#f0ad4e; color:#000; padding:4px 8px; font-size:0.8rem;" onclick="editNews(${index})">✏️ แก้ไข</button>
          <button class="btn-secondary" style="background:#c9302c; padding:4px 8px; font-size:0.8rem;" onclick="deleteNews(${index})">🗑️ ลบ</button>
        </div>
      </div>
    `;
  });
}

window.openNewsModal = function () {
  document.getElementById("newsModalTitle").innerText = "สร้างข่าวสารส่วนกลาง";
  document.getElementById("newsId").value = "";
  document.getElementById("newsTitle").value = "";
  document.getElementById("newsContent").value = "";
  const imgInput = document.getElementById("newsImageUrl");
  if (imgInput) imgInput.value = "";
  document.getElementById("newsModal").classList.add("open");
};

window.editNews = function (index) {
  const n = news[index];
  document.getElementById("newsModalTitle").innerText = "แก้ไขข่าวสารส่วนกลาง";
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
        title,
        content,
        imageUrl,
        updatedAtString: currentDateTime,
      });
    } else {
      await addDoc(collection(db, "news"), {
        title,
        content,
        imageUrl,
        date: currentDateTime,
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
// 6. USER MANAGEMENT & BAN SYSTEM (ระบบจัดการผู้ใช้และการแบน)
// ==========================================
function renderUsers() {
  const tbody = document.getElementById("userTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">ยังไม่มีข้อมูลผู้ใช้ในระบบ</td></tr>';
    return;
  }

  users.forEach((u, index) => {
    const isBanned = u.isBanned === true || u.status === "banned" || u.status === "Banned";
    tbody.innerHTML += `
      <tr>
        <td>${u.nickname || u.name || "-"}</td>
        <td>${u.email || "-"}</td>
        <td><span style="color:${isBanned ? "#ff2a2a" : "#28a745"}">${isBanned ? "Banned" : (u.RoleUser || u.role || "Member")}</span></td>
        <td>
          <button class="btn-secondary" style="background:${isBanned ? "#28a745" : "#f0ad4e"}; color:${isBanned ? "#fff" : "#000"}; padding:3px 8px; font-size:0.8rem;" onclick="toggleBanUser(${index})">${isBanned ? "ปลดแบน" : "แบน"}</button>
          <button class="btn-secondary" style="background:#c9302c; padding:3px 8px; font-size:0.8rem;" onclick="deleteUser(${index})">ลบ</button>
        </td>
      </tr>
    `;
  });
}

window.toggleBanUser = async function (index) {
  const u = users[index];
  const isCurrentlyBanned = u.isBanned === true || u.status === "banned" || u.status === "Banned";
  const newBanStatus = !isCurrentlyBanned;
  const statusText = newBanStatus ? "Banned" : "Active";

  if (confirm(`ยืนยันเปลี่ยนสถานะผู้ใช้นี้เป็น "${statusText}"?`)) {
    try {
      await updateDoc(doc(db, "users", u.firebaseId), {
        isBanned: newBanStatus,
        status: statusText,
      });
      alert("✅ อัปเดตสถานะการแบนสำเร็จ!");
    } catch (err) {
      alert("❌ เกิดข้อผิดพลาด: " + err.message);
    }
  }
};

window.deleteUser = async function (index) {
  if (confirm("⚠️ ยืนยันการลบบัญชีผู้ใช้นี้ออกจากระบบฐานข้อมูล?")) {
    try {
      await deleteDoc(doc(db, "users", users[index].firebaseId));
      alert("✅ ลบบัญชีผู้ใช้สำเร็จ!");
    } catch (err) {
      alert("❌ เกิดข้อผิดพลาด: " + err.message);
    }
  }
};