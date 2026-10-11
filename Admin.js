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
    "passed",
    "stage2_submitted",
    "revision_requested",
    "edit_requested",
    "edit_allowed",
    "approved",
    "completed",
    "role_pending_review"
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

    // 🔄 เรียงลำดับโปรเจกต์: สร้างทีหลัง (ใหม่กว่า) ขึ้นแสดงผลก่อนเสมอ
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
};

window.openProjectModal = function () {
  document.getElementById("projectModalTitle").innerText = "สร้างโปรเจกต์ใหม่";
  document.getElementById("projId").value = "";
  document.getElementById("projName").value = "";
  if (document.getElementById("projImageUrl")) document.getElementById("projImageUrl").value = "";
  if (document.getElementById("projDescription")) document.getElementById("projDescription").value = "";
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
  const imageUrl = document.getElementById("projImageUrl") ? document.getElementById("projImageUrl").value.trim() : "";
  const description = document.getElementById("projDescription") ? document.getElementById("projDescription").value.trim() : "";
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

  const roleErrorElem = document.getElementById("roleError");
  if (totalRolesCount > maxMembers) {
    if (roleErrorElem) roleErrorElem.style.display = "block";
    return;
  }
  if (roleErrorElem) roleErrorElem.style.display = "none";

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
        {
          title: "ลิงก์ช่องทางติดต่อเพิ่มเติม (Discord / Facebook)",
          type: "text",
        },
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
  if (document.getElementById("projImageUrl")) document.getElementById("projImageUrl").value = proj.imageUrl || "";
  if (document.getElementById("projDescription")) document.getElementById("projDescription").value = proj.description || "";
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
// 2. STAGE 2 CONFIG
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
  wrapper.style.marginBottom = "12px";
  wrapper.style.background = "#181818";
  wrapper.style.padding = "10px";
  wrapper.style.borderRadius = "6px";
  wrapper.style.border = "1px solid #333";

  wrapper.innerHTML = `
    <div style="margin-bottom: 6px;">
      <label style="font-size: 0.85rem; color: #17a2b8; font-weight: bold; display: block; margin-bottom: 4px;">หัวข้อคำถาม / ชื่อเอกสาร:</label>
      <input type="text" placeholder="เช่น ลิงก์ช่องทางติดต่อ, ประสบการณ์" class="s2-q-title" value="${qText}" required style="width: 100%; padding: 8px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; box-sizing: border-box;" />
    </div>
    <div style="display: flex; gap: 8px; align-items: center;">
      <select class="s2-q-type" style="flex: 1; padding: 6px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px;">
        <option value="text" ${qType === "text" ? "selected" : ""}>ข้อความสั้น</option>
        <option value="textarea" ${qType === "textarea" ? "selected" : ""}>ข้อความยาว</option>
        <option value="number" ${qType === "number" ? "selected" : ""}>ตัวเลข</option>
        <option value="date" ${qType === "date" ? "selected" : ""}>วันที่</option>
        <option value="email" ${qType === "email" ? "selected" : ""}>อีเมล</option>
        <option value="image" ${qType === "image" ? "selected" : ""}>📷 อัปโหลดภาพ / รูปเอกสาร</option>
      </select>
      <button type="button" onclick="this.closest('div').parentElement.remove()" style="background:#ff2a2a; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">✕ ลบข้อนี้</button>
    </div>
  `;
  container.appendChild(wrapper);
};

window.handleSaveStage2Config = async function (e) {
  e.preventDefault();
  if (currentProjectIndexForStage2Config === null) return;
  const proj = projects[currentProjectIndexForStage2Config];

  const stage2Description = document
    .getElementById("stage2Description")
    .value.trim();
  const titles = document.querySelectorAll(".s2-q-title");
  const types = document.querySelectorAll(".s2-q-type");
  let stage2Questions = [];

  for (let i = 0; i < titles.length; i++) {
    if (titles[i].value.trim()) {
      stage2Questions.push({
        title: titles[i].value.trim(),
        type: types[i].value,
      });
    }
  }

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
// 3. APPLICATIONS & ROUND MANAGEMENT
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
  container.innerHTML = `<h4>โปรเจกต์: ${proj.name} (ประวัติผู้สมัครทุกรอบ)</h4><br>`;

  if (!proj.applications || proj.applications.length === 0) {
    container.innerHTML +=
      '<p style="color:#888;">ยังไม่มีประวัติผู้สมัครในระบบ</p>';
    return;
  }

  const searchTerm = document
    .getElementById("appSearchInput")
    .value.toLowerCase()
    .trim();
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
    const appIndex = proj.applications.indexOf(app);
    const appStatus = app.status || "pending";

    if (statusFilter !== "all" && appStatus !== statusFilter) return;
    const userName = (app.user || "").toLowerCase();
    const userEmail = (app.accountEmail || "").toLowerCase();
    if (
      searchTerm &&
      !userName.includes(searchTerm) &&
      !userEmail.includes(searchTerm)
    )
      return;

    let round1Html = "";
    const userChoices = extractApplicantChoices(app, proj);

    if (app.answers) {
      if (Array.isArray(app.answers)) {
        app.answers.forEach((ans) => {
          round1Html += `<p style="margin:2px 0; font-size:0.85rem;">• ${ans.title}: <span style="color:#ddd;">${ans.value || "-"}</span></p>`;
        });
      } else {
        for (const [q, a] of Object.entries(app.answers)) {
          round1Html += `<p style="margin:2px 0; font-size:0.85rem;">• ${q}: <span style="color:#ddd;">${a || "-"}</span></p>`;
        }
      }
    }

    let round2Html =
      '<p style="color:#666; font-size:0.85rem;">ยังไม่ได้ส่งข้อมูลรอบ 2</p>';
    if (app.stage2Answers) {
      round2Html = "";
      for (const [q, a] of Object.entries(app.stage2Answers)) {
        round2Html += `<p style="margin:2px 0; font-size:0.85rem;">• ${q}: <span style="color:#ddd;">${a || "-"}</span></p>`;
      }
    }

    let statusBadge =
      '<span class="badge-status status-pending">1. ยืนสมัคร (รอตรวจรอบ 1)</span>';
    if (appStatus === "interview")
      statusBadge =
        '<span class="badge-status status-interview">1.1 สัมภาษณ์แล้ว</span>';
    if (appStatus === "passed")
      statusBadge =
        '<span class="badge-status status-passed">1.2 ผ่านรอบ 1 (รอผู้สมัครส่งเอกสารรอบ 2)</span>';
    if (appStatus === "stage2_submitted")
      statusBadge =
        '<span class="badge-status" style="background:#17a2b8; color:#fff;">2. ส่งเอกสารรอบ 2 แล้ว (รอแอดมินยืนยันข้อมูล)</span>';
    if (appStatus === "revision_requested")
      statusBadge =
        '<span class="badge-status" style="background:#f0ad4e; color:#000;">🔄 ตีกลับรอบ 2 ให้แก้ไข</span>';
    if (appStatus === "edit_requested")
      statusBadge =
        '<span class="badge-status" style="background:#f0ad4e; color:#000;">1.9.5 ขอแก้ไขเอกสารรอบ 2 (รอแอดมินอนุมัติ)</span>';
    if (appStatus === "edit_allowed")
      statusBadge =
        '<span class="badge-status" style="background:#28a745; color:#fff;">🔓 1.9.5 อนุญาตให้แก้ไขแล้ว</span>';
    if (appStatus === "role_pending_review" || app.appealStatus === "pending")
      statusBadge = `<span class="badge-status" style="background:#17a2b8; color:#fff;">⏳ 1.2.5 รออนุมัติอุทธรณ์บทบาท (${app.pendingAppealRole || app.selectedNewRole || "-"})</span>`;
    if (appStatus === "approved")
      statusBadge = `<span class="badge-status status-approved">3. เข้าสู่โปรเจกต์แล้ว (${app.assignedRole || "สมาชิก"})</span>`;
    if (appStatus === "rejected")
      statusBadge =
        '<span class="badge-status status-rejected">❌ ไม่ผ่านการคัดเลือก</span>';

    let choiceSummaryTag = "";
    if (userChoices.length > 0) {
      choiceSummaryTag = `<div style="font-size:0.8rem; color:#f0ad4e; margin-top:2px;">⭐ ตัวเลือกที่ระบุ: ${userChoices.map((c, i) => `อันดับ ${i + 1}:${c}`).join(" | ")}</div>`;
    }
    let lockedRoleTag = "";
    if (app.assignedRole) {
      lockedRoleTag = `<div style="font-size:0.80rem; color:#28a745; font-weight:bold; margin-top:2px;">🔒 ล็อคบทบาท: ${app.assignedRole}${app.approvedRank ? `(จากตัวเลือกอันดับ ${app.approvedRank})` : ""}</div>`;
    }

    let actionButtons = "";
    if (appStatus === "pending") {
      actionButtons = `
        <button class="btn-secondary" style="background:#f0ad4e; color:#000;" onclick="openInterviewPrompt(${appIndex})">📅 1.1 นัดสัมภาษณ์</button>
        <button class="btn-secondary" style="background:#c9302c;" onclick="updateAppStatus(${appIndex}, 'rejected')">❌ ปฏิเสธ</button>
      `;
    } else if (appStatus === "interview") {
      actionButtons = `
        <button class="btn-secondary" style="background:#17a2b8;" onclick="openApplicationChoicesModal(${appIndex})">✅ 1.2 พิจารณาบทบาทรอบ 2</button>
        <button class="btn-secondary" style="background:#f0ad4e; color:#000;" onclick="openInterviewPrompt(${appIndex})">📅 เปลี่ยนเวลานัดสัมภาษณ์</button>
        <button class="btn-secondary" style="background:#c9302c;" onclick="updateAppStatus(${appIndex}, 'rejected')">❌ ปฏิเสธ</button>
      `;
    } else if (appStatus === "stage2_submitted") {
      actionButtons = `
        <button class="btn-secondary" style="background:#28a745;" onclick="updateAppStatus(${appIndex}, 'approved')">🎯 2.1 ยืนยันข้อมูล & เข้าสู่โปรเจกต์ (รอบ 3)</button>
        <button class="btn-secondary" style="background:#f0ad4e; color:#000;" onclick="openRevisionPrompt(${appIndex})">🔄 ตีกลับรอบ 2 ให้แก้ไข</button>
      `;
    } else if (appStatus === "edit_requested") {
      actionButtons = `
        <button class="btn-secondary" style="background:#28a745;" onclick="approveEditRequest(${appIndex})">🔓 1.9.5 อนุมัติคำขอแก้</button>
        <button class="btn-secondary" style="background:#c9302c;" onclick="rejectEditRequest(${appIndex})">❌ 1.9.5 ไม่อนุมัติคำขอแก้</button>
      `;
    } else if (appStatus === "edit_allowed") {
      actionButtons = `
        <span style="font-size:0.85rem; color:#28a745; align-self:center;">⏳ กำลังรอผู้สมัครแก้ไขและส่งข้อมูลรอบ 2 กลับมา...</span>
      `;
    } else if (appStatus === "passed") {
      actionButtons = `
        <button class="btn-secondary" style="background:#17a2b8;" onclick="openApplicationChoicesModal(${appIndex})">🔍 ดูตัวเลือก/เปลี่ยนบทบาท (1.2)</button>
      `;
    } else if (appStatus === "role_pending_review" || app.appealStatus === "pending") {
      actionButtons = `
        <button class="btn-secondary" style="background:#28a745;" onclick="adminReviewRole(${appIndex}, 'approve')">✅ 1.2.5 อนุมัติอุทธรณ์ (${app.pendingAppealRole || app.selectedNewRole})</button>
        <button class="btn-secondary" style="background:#c9302c;" onclick="adminReviewRole(${appIndex}, 'reject')">❌ 1.2.5 ปฏิเสธอุทธรณ์</button>
      `;
    } else if (appStatus === "revision_requested") {
      actionButtons = `
        <span style="font-size:0.85rem; color:#f0ad4e; align-self:center;">⏳ รอผู้สมัครแก้ไขและส่งข้อมูลรอบ 2 ใหม่ (ขั้นตอนที่ 2)...</span>
      `;
    } else if (appStatus === "approved") {
      actionButtons = `<span style="font-size:0.85rem; color:#28a745;">✨ 3. อยู่ในโปรเจกต์เรียบร้อยแล้ว</span>`;
    } else {
      actionButtons = ``;
    }

    container.innerHTML += `
      <div class="app-item" style="background:#141414; border:1px solid #333; padding:12px; border-radius:6px; margin-bottom:10px;">
        <div><strong>👤 ${app.user || "ไม่ระบุชื่อ"}</strong> ${statusBadge}</div>
        ${choiceSummaryTag}
        ${lockedRoleTag}
        <div style="font-size:0.8rem; color:#aaa; margin-top:4px; margin-bottom:6px;">📧 ${app.accountEmail || "-"} | สมัครเมื่อ: ${app.createdAtString || "-"}</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <div style="background:#1c1c1c; padding:8px; border-radius:4px;"><p style="color:#ff2a2a; font-size:0.8rem; font-weight:bold;">📋 รอบที่ 1 (คำตอบผู้สมัคร):</p>${round1Html}</div>
          <div style="background:#1c1c1c; padding:8px; border-radius:4px;"><p style="color:#17a2b8; font-size:0.8rem; font-weight:bold;">📝 รอบที่ 2:</p>${round2Html}</div>
        </div>
        ${app.interviewDate ? `<p style="font-size:0.85rem; color:#f0ad4e; margin-top:6px;">📅 นัดสัมภาษณ์ (1.1): ${app.interviewDate}</p>` : ""}
        ${app.assignedRole && !lockedRoleTag ? `<p style="font-size:0.85rem; color:#28a745; margin-top:6px;">🎯 บทบาทที่ได้รับ: ${app.assignedRole}${app.approvedRank ? `(จากตัวเลือกอันดับ ${app.approvedRank})` : ""}</p>` : ""}
        ${app.pendingAppealRole ? `<p style="font-size:0.85rem; color:#17a2b8; margin-top:6px;">🔄 บทบาทที่ยื่นอุทธรณ์ (1.2.5): ${app.pendingAppealRole}</p>` : ""}
        ${app.revisionNote ? `<p style="font-size:0.85rem; color:#f0ad4e; margin-top:6px;">💬 หมายเหตุจากแอดมิน: ${app.revisionNote}</p>` : ""}
        ${app.editReason ? `<p style="font-size:0.85rem; color:#f0ad4e; margin-top:6px;">🔄 เหตุผลขอแก้ (1.9.5): ${app.editReason}</p>` : ""}
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
          "passed",
          "stage2_submitted",
          "revision_requested",
          "edit_requested",
          "edit_allowed",
          "approved",
          "completed",
          "role_pending_review",
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

window.adminReviewRole = async function (appIndex, actionType) {
  const proj = projects[currentProjectIndex];
  const app = proj.applications[appIndex];
  const appealRole = app.pendingAppealRole || app.selectedNewRole;

  if (actionType === "approve") {
    app.assignedRole = appealRole;
    app.status = "passed";
    app.appealStatus = "approved";
    delete app.pendingAppealRole;
    delete app.selectedNewRole;
    app.revisionNote = `เจ้าหน้าที่อนุมัติอุทธรณ์เปลี่ยนเป็นบทบาท: ${app.assignedRole} เรียบร้อยแล้ว`;
  } else if (actionType === "reject") {
    app.status = "revision_requested";
    app.appealStatus = "rejected";
    delete app.pendingAppealRole;
    delete app.selectedNewRole;
    app.revisionNote = `เจ้าหน้าที่ปฏิเสธคำขออุทธรณ์บทบาท กรุณาเลือกบทบาทอื่น`;
  }

  try {
    await updateDoc(doc(db, "projects", proj.firebaseId), {
      applications: proj.applications,
    });
    window.renderApplicationsList();
    alert(actionType === "approve" ? "✅ อนุมัติอุทธรณ์บทบาทเรียบร้อย!" : "❌ ปฏิเสธคำขออุทธรณ์เรียบร้อย!");
  } catch (err) {
    alert("เกิดข้อผิดพลาด: " + err.message);
  }
};

window.openApplicationChoicesModal = function (appIndex) {
  const proj = projects[currentProjectIndex];
  const app = proj.applications[appIndex];

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
      let actionHtml = `<button class="btn-secondary" style="background:#28a745; padding:6px 12px; font-size:0.85rem; font-weight:bold;" onclick="approveAppWithChoice(${appIndex}, '${choiceRole}', ${rankNumber})">✅ ล็อคบทบาทนี้ (อันดับ ${rankNumber}) - เข้าสู่รอบ 2</button>`;

      if (!roleCheck.available) {
        statusColor = "#ff2a2a";
        statusBadgeText = "เต็ม";
        statusText = `🔴 เต็มแล้ว! (${roleCheck.currentCount}/${roleCheck.maxCount} คน เต็มโควตา)`;
        actionHtml = `<p style="margin:0; font-size:0.75rem; color:#aaa; font-style:italic;">*บทบาทนี้เต็มโควตาตามเงื่อนไขข้อ 1.2 (ลองพิจารณาอันดับถัดไป)</p>`;
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
    <p style="font-size:0.85rem; color:#aaa; margin-bottom:10px;">นับจากอันดับ 1 หากเต็มให้ดูอันดับ 2, 3 ตามลำดับ</p>
    ${choicesHtml}
    <hr style="border-color:#333; margin:15px 0;">
    <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:space-between;">
      <button class="btn-secondary" style="background:#f0ad4e; color:#000; font-weight:bold;" onclick="requestNewChoices(${appIndex})">🔄 1.2.5 แจ้งยื่นอุทธรณ์บทบาทใหม่</button>
      <button class="btn-secondary" style="background:#c9302c; font-weight:bold;" onclick="rejectApplicationCompletely(${appIndex})">❌ ปฏิเสธการสมัคร</button>
    </div>
  `;

  modal.style.display = "flex";
  modal.classList.add("open");
};

window.approveAppWithChoice = async function (appIndex, chosenRole, rankNumber) {
  if (!confirm(`ยืนยันล็อคบทบาท "${chosenRole}" (จากอันดับ ${rankNumber}) และนำเข้าสู่รอบ 2?`)) return;

  await updateAppStatusWithData(appIndex, "passed", {
    assignedRole: chosenRole,
    approvedRank: rankNumber,
    approvalNote: `ล็อคบทบาท ${chosenRole} (อันดับ ${rankNumber}) เรียบร้อย เข้าสู่รอบ 2`,
  });

  const modal = document.getElementById("appChoicesModal");
  if (modal) modal.style.display = "none";
  alert("✅ ล็อคบทบาทและนำเข้าสู่รอบที่ 2 สำเร็จ!");
};

window.requestNewChoices = async function (appIndex) {
  const note = prompt("ระบุข้อความแจ้งเตือนให้ผู้สมัครยื่นอุทธรณ์เปลี่ยนบทบาทใหม่ (1.2.5):");
  if (note !== null) {
    await updateAppStatusWithData(appIndex, "revision_requested", {
      revisionNote: note || "กรุณายื่นอุทธรณ์เลือกบทบาทใหม่อีกครั้ง (1.2.5)",
      requiresNewChoices: true,
    });
    alert("✅ ส่งคำขอให้ผู้สมัครเรียบร้อยแล้ว!");
    const modal = document.getElementById("appChoicesModal");
    if (modal) modal.style.display = "none";
  }
};

window.rejectApplicationCompletely = async function (appIndex) {
  if (confirm("⚠️ ต้องการปฏิเสธการสมัครของผู้สมัครรายนี้?")) {
    await updateAppStatusWithData(appIndex, "rejected", {
      approvalNote: "ปฏิเสธการสมัครเนื่องจากโควตาเต็มหรือคุณสมบัติไม่ผ่าน",
    });
    const modal = document.getElementById("appChoicesModal");
    if (modal) modal.style.display = "none";
    alert("❌ ปฏิเสธการสมัครเรียบร้อย");
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

window.openRevisionPrompt = function (appIndex) {
  const note = prompt("ระบุจุดที่ต้องการให้ผู้สมัครแก้ไขในฟอร์มรอบที่ 2:");
  if (note !== null) {
    updateAppStatusWithData(appIndex, "revision_requested", {
      revisionNote: note || "กรุณาแก้ไขข้อมูลในรอบที่ 2",
    });
  }
};

window.approveEditRequest = async function (appIndex) {
  if (!confirm("🔓 ต้องการอนุมัติคำขอแก้ไขเอกสารรอบ 2 ให้ผู้สมัครหรือไม่?")) return;
  await updateAppStatusWithData(appIndex, "edit_allowed", {
    revisionNote: "แอดมินอนุมัติคำขอแก้ไขเอกสารรอบ 2 แล้ว กรุณาส่งข้อมูลกลับมาใหม่",
  });
  alert("✅ อนุมัติสิทธิ์ให้ผู้สมัครแก้ไขเรียบร้อย!");
};

window.rejectEditRequest = async function (appIndex) {
  const note = prompt("ระบุเหตุผลที่ไม่อนุมัติคำขอแก้ไข (1.9.5):");
  if (note !== null) {
    await updateAppStatusWithData(appIndex, "stage2_submitted", {
      editReason: null,
      revisionNote: `ไม่อนุมัติคำขอแก้ไขรอบ 2 (1.9.5): ${note}`,
    });
    alert("❌ ปฏิเสธคำขอแก้ไขเรียบร้อย");
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
      updatedAtString: currentDateTime,
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
  const proj = projects[index];
  document.getElementById("w3ProjTitle").innerText = `ประกาศ & สมาชิก (ขั้นตอนที่ 3): ${proj.name}`;
  document.getElementById("pNewsTitle").value = "";
  document.getElementById("pNewsContent").value = "";
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
  const pNews = proj.projectNews || [];

  if (pNews.length === 0) {
    container.innerHTML = '<p style="color:#888; font-size:0.85rem;">ยังไม่มีประกาศเฉพาะกลุ่ม</p>';
    return;
  }

  pNews.forEach((n, nIdx) => {
    container.innerHTML += `
      <div style="background:#181818; padding:8px; border-radius:4px; border-left:3px solid #ff2a2a; margin-bottom:6px;">
        <strong>${n.title}</strong>
        <p style="font-size:0.85rem; color:#aaa;">${n.content}</p>
        <div style="font-size:0.7rem; color:#777; margin-top:2px;">🕒 ${n.date || "-"}</div>
        <button class="btn-secondary" style="background:#c9302c; padding:2px 6px; font-size:0.75rem; margin-top:4px;" onclick="deleteProjectNews(${nIdx})">ลบข่าว</button>
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
    alert("✅ ส่งข่าวเฉพาะกลุ่มสำเร็จ!");
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

function renderProjectMembersList() {
  const proj = projects[currentProjectIndexForWindow3];
  const container = document.getElementById("projectMembersListContainer");
  container.innerHTML = "";

  const members = proj.applications ? proj.applications.filter((a) => isCountedAsPassed(a.status)) : [];

  if (members.length === 0) {
    container.innerHTML = '<p style="color:#888; font-size:0.85rem;">ยังไม่มีสมาชิกในโปรเจกต์</p>';
    return;
  }

  members.forEach((m) => {
    const realIndex = proj.applications.findIndex(
      (item) => item.uid === m.uid && item.accountEmail === m.accountEmail,
    );
    container.innerHTML += `
      <div style="background:#181818; padding:8px; border-radius:4px; display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <div><strong>${m.user || "ไม่ระบุ"}</strong> <span style="color:#28a745; font-size:0.8rem;">(${m.assignedRole || "สมาชิก"})</span><div style="font-size:0.75rem; color:#aaa;">${m.accountEmail}</div></div>
        <button class="btn-secondary" style="background:#c9302c; padding:3px 8px; font-size:0.75rem;" onclick="removeMemberFromProject(${realIndex})">ปลดออก</button>
      </div>
    `;
  });
}

window.removeMemberFromProject = async function (appIndex) {
  if (!confirm("⚠️ ต้องการปลดสมาชิกออกและคืนโควตาใช่หรือไม่?")) return;
  const proj = projects[currentProjectIndexForWindow3];
  const currentDateTime = new Date().toLocaleString("th-TH");
  proj.applications[appIndex].status = "rejected";
  proj.applications[appIndex].updatedAtString = currentDateTime;
  try {
    await updateDoc(doc(db, "projects", proj.firebaseId), {
      applications: proj.applications,
      updatedAt: serverTimestamp(),
      updatedAtString: currentDateTime,
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
    const index = users.indexOf(u);
    const isBanned = u.status === "Banned";
    tbody.innerHTML += `
      <tr>
        <td>${u.nickname || u.name || "-"}</td>
        <td>${u.email || "-"}</td>
        <td><span style="color:${isBanned ? "#ff2a2a" : "#28a745"}">${u.status || "Active"}</span></td>
        <td>
          <button class="btn-secondary" style="background:${isBanned ? "#28a745" : "#f0ad4e"}; color:${isBanned ? "#fff" : "#000"}; padding:3px 8px; font-size:0.8rem;" onclick="toggleBanUser(${index})">${isBanned ? "ปลดแบน" : "แบน"}</button>
          <button class="btn-secondary" style="background:#c9302c; padding:3px 8px; font-size:0.8rem;" onclick="deleteUser(${index})">ลบ</button>
        </td>
      </tr>
    `;
  });
};

window.toggleBanUser = async function (index) {
  const u = users[index];
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

window.deleteUser = async function (index) {
  if (confirm("ยืนยันลบผู้ใช้?")) {
    try {
      await deleteDoc(doc(db, "users", users[index].firebaseId));
      alert("✅ ลบผู้ใช้สำเร็จ!");
    } catch (err) {
      alert("❌ เกิดข้อผิดพลาด: " + err.message);
    }
  }
};
