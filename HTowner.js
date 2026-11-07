import { db } from "./firebase-config.js";
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ตัวแปรเก็บข้อมูลประวัติและรายการโปรเจกต์สำหรับตัวกรอง
let historyList = [];
let availableProjects = [];

/**
 * 📥 [รับค่าเข้า - Input] ฟังก์ชันบันทึกประวัติกิจกรรมแอดมินแบบละเอียด (บันทึกข้อมูลก่อนและหลังแก้ไข)
 * @param {string} actionTitle - หัวข้อกิจกรรม (เช่น "แก้ไขข้อมูลโปรเจกต์", "ปรับเปลี่ยนบทบาทผู้ใช้")
 * @param {string} actionDetail - รายละเอียดสรุปของการกระทำ
 * @param {Object|null} beforeData - ข้อมูลทั้งหมดก่อนแก้ไข (ถ้ามี)
 * @param {Object|null} afterData - ข้อมูลทั้งหมดหลังแก้ไข (ถ้ามี)
 */
export async function logAdminAction(actionTitle, actionDetail, beforeData = null, afterData = null) {
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    let adminName = "Unknown Admin";
    let adminEmail = "-";

    if (user) {
      adminEmail = user.email || "-";
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const uData = userDoc.data();
        adminName = uData.nickname || uData.username || uData.name || user.email || "Owner/Admin";
      }
    }

    const currentDateTime = new Date().toLocaleString("th-TH");
    const lowerTitle = (actionTitle || "").toLowerCase();
    const lowerDetail = (actionDetail || "").toLowerCase();

    // 🔄 ระบบจำแนกหมวดหมู่ (Category)
    let category = "other";
    if (
      lowerTitle.includes("โปรเจกต์") || 
      lowerTitle.includes("สมาชิก") || 
      lowerTitle.includes("บทบาท") || 
      lowerTitle.includes("อุทธรณ์") || 
      lowerTitle.includes("เอกสาร") || 
      lowerTitle.includes("สัมภาษณ์") || 
      lowerTitle.includes("ลูกเซิร์ฟ") ||
      lowerDetail.includes("โปรเจกต์")
    ) {
      category = "project";
    } else if (
      lowerTitle.includes("ข่าวสาร") || 
      lowerTitle.includes("ประกาศ") ||
      lowerTitle.includes("สไลเดอร์")
    ) {
      category = "news";
    } else if (
      lowerTitle.includes("ผู้ใช้") || 
      lowerTitle.includes("แบน") || 
      lowerTitle.includes("บัญชี")
    ) {
      category = "user";
    }

    // บันทึกข้อมูลลง Firestore Collection 'admin_history' พร้อมข้อมูลย้อนหลังก่อน-หลัง
    await addDoc(collection(db, "admin_history"), {
      adminName,
      adminEmail,
      actionTitle,
      actionDetail,
      category,
      beforeData: beforeData ? JSON.parse(JSON.stringify(beforeData)) : null,
      afterData: afterData ? JSON.parse(JSON.stringify(afterData)) : null,
      timestamp: serverTimestamp(),
      dateString: currentDateTime,
    });
  } catch (err) {
    console.error("Failed to log admin action:", err);
  }
}

/**
 * 🔄 เริ่มต้นโมดูลประวัติ (ดึงข้อมูลแบบ Realtime ทั้งประวัติและรายชื่อโปรเจกต์)
 */
export function initHistoryModule() {
  const container = document.getElementById("historyListContainer");
  if (!container) return;

  // 1. ดึงรายชื่อโปรเจกต์มาทำ Dropdown ตัวเลือกย่อยอัตโนมัติ
  onSnapshot(collection(db, "projects"), (snapshot) => {
    availableProjects = [];
    snapshot.forEach((docSnap) => {
      const pData = docSnap.data();
      if (pData.name) availableProjects.push(pData.name);
    });
    updateProjectDropdown();
  }, (err) => console.error("Error loading projects for filter:", err));

  // 2. ดึงข้อมูลประวัติแอดมินแบบ Realtime จาก collection 'admin_history'
  onSnapshot(collection(db, "admin_history"), (snapshot) => {
    historyList = [];
    snapshot.forEach((docSnap) => {
      historyList.push({ id: docSnap.id, ...docSnap.data() });
    });

    // เรียงลำดับประวัติจากล่าสุดไปเก่าสุด
    historyList.sort((a, b) => {
      const getTime = (val) => {
        if (!val) return 0;
        if (typeof val.toDate === 'function') return val.toDate().getTime();
        const parsed = new Date(val).getTime();
        return isNaN(parsed) ? 0 : parsed;
      };
      return getTime(b.timestamp) - getTime(a.timestamp);
    });

    if (typeof window.renderAdminHistory === 'function') {
      window.renderAdminHistory();
    }
  }, (err) => {
    console.error("Error loading admin history:", err);
    if (container) {
      container.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ff2a2a; padding:20px;">❌ ไม่สามารถโหลดข้อมูลประวัติได้</td></tr>';
    }
  });
}

function updateProjectDropdown() {
  const selectElem = document.getElementById("historyProjectFilter");
  if (!selectElem) return;
  
  const currentVal = selectElem.value;
  selectElem.innerHTML = '<option value="all">📌 ทุกโปรเจกต์ทั้งหมด</option>';
  
  availableProjects.forEach(projName => {
    const isSelected = currentVal === projName ? "selected" : "";
    selectElem.innerHTML += `<option value="${projName}" ${isSelected}>📁 โปรเจกต์: ${projName}</option>`;
  });
}

/**
 * 🛠️ ฟังก์ชันคำนวณความเปรียบเทียบก่อน-หลัง (Diff View)
 */
function buildDiffHtml(before, after) {
  if (!before && !after) return "";

  let html = `<div style="margin-top: 8px; background: #111; padding: 8px 10px; border-radius: 6px; font-size: 0.8rem;">`;

  // กรณี 1: มีทั้งข้อมูลก่อนและหลัง (เป็นการแก้ไข)
  if (before && after) {
    const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    let changesCount = 0;

    allKeys.forEach((key) => {
      // ข้ามฟิลด์ที่เป็นประเภท Object/Array ซับซ้อน เพื่อให้อ่านง่าย
      const valBefore = typeof before[key] === "object" ? JSON.stringify(before[key]) : before[key];
      const valAfter = typeof after[key] === "object" ? JSON.stringify(after[key]) : after[key];

      if (valBefore !== valAfter) {
        changesCount++;
        html += `
          <div style="margin-bottom: 4px; word-break: break-all;">
            <strong style="color: #ffca28;">🔸 ${key}:</strong> 
            <span style="color: #ff6b6b; text-decoration: line-through;">${valBefore ?? "ไม่มีค่า"}</span> 
            ➡️ 
            <span style="color: #51cf66; font-weight: bold;">${valAfter ?? "ไม่มีค่า"}</span>
          </div>
        `;
      }
    });

    if (changesCount === 0) {
      html += `<div style="color: #888;">(ไม่มีการเปลี่ยนแปลงในค่าข้อมูลหลัก)</div>`;
    }
  } 
  // กรณี 2: มีเฉพาะข้อมูลหลังอย่างเดียว (สร้างใหม่)
  else if (after) {
    html += `<div style="color: #51cf66; font-weight: bold; margin-bottom: 4px;">📥 ข้อมูลใหม่ที่เพิ่มเข้ามา:</div>`;
    Object.keys(after).forEach((key) => {
      const val = typeof after[key] === "object" ? JSON.stringify(after[key]) : after[key];
      html += `<div style="color: #ccc;">• <strong>${key}:</strong> ${val}</div>`;
    });
  } 
  // กรณี 3: มีเฉพาะข้อมูลก่อนอย่างเดียว (ลบออก)
  else if (before) {
    html += `<div style="color: #ff6b6b; font-weight: bold; margin-bottom: 4px;">🗑️ ข้อมูลเดิมก่อนถูกลบ:</div>`;
    Object.keys(before).forEach((key) => {
      const val = typeof before[key] === "object" ? JSON.stringify(before[key]) : before[key];
      html += `<div style="color: #aaa;">• <strong>${key}:</strong> ${val}</div>`;
    });
  }

  html += `</div>`;
  return html;
}

/**
 * 📤 [ส่งออกผลลัพธ์ - Output/Render] ฟังก์ชันเรนเดอร์รายการประวัติลงตารางพร้อมตัวกรองและการแสดงผล Diff ย้อนหลัง
 */
window.renderAdminHistory = function() {
  const container = document.getElementById("historyListContainer");
  if (!container) return;

  const searchInputElem = document.getElementById("adminHistorySearch");
  const categoryFilterElem = document.getElementById("historyCategoryFilter");
  const projectFilterElem = document.getElementById("historyProjectFilter");

  const keyword = searchInputElem ? searchInputElem.value.toLowerCase().trim() : "";
  const selectedCategory = categoryFilterElem ? categoryFilterElem.value : "all";
  const selectedProject = projectFilterElem ? projectFilterElem.value : "all";

  container.innerHTML = "";

  if (historyList.length === 0) {
    container.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888; padding:20px;">ยังไม่มีประวัติกิจกรรมในระบบ</td></tr>';
    return;
  }

  // ตัวกรองข้อมูล (Filtering Logic)
  const filteredHistory = historyList.filter(item => {
    const title = (item.actionTitle || "").toLowerCase();
    const detail = (item.actionDetail || "").toLowerCase();
    const admin = (item.adminName || "").toLowerCase();
    const email = (item.adminEmail || "").toLowerCase();
    const itemCategory = (item.category || "").toLowerCase();
    const beforeStr = JSON.stringify(item.beforeData || {}).toLowerCase();
    const afterStr = JSON.stringify(item.afterData || {}).toLowerCase();

    // 1. ค้นหาด้วย Keyword อิสระ (รวมไปถึงค้นหาข้อมูลใน before/after Data)
    const matchesKeyword = title.includes(keyword) || 
                           detail.includes(keyword) || 
                           admin.includes(keyword) || 
                           email.includes(keyword) ||
                           beforeStr.includes(keyword) ||
                           afterStr.includes(keyword);
    if (!matchesKeyword) return false;

    // 2. กรองตามประเภทหมวดหมู่หลัก (Project, News, User)
    if (selectedCategory !== "all") {
      if (itemCategory !== selectedCategory) return false;
    }

    // 3. กรองตามชื่อโปรเจกต์เฉพาะเจาะจง
    if (selectedProject !== "all") {
      if (!detail.includes(selectedProject) && !beforeStr.includes(selectedProject.toLowerCase()) && !afterStr.includes(selectedProject.toLowerCase())) {
        return false;
      }
    }

    return true;
  });

  if (filteredHistory.length === 0) {
    container.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888; padding:20px;">ไม่พบประวัติกิจกรรมตามเงื่อนไขที่ค้นหา</td></tr>';
    return;
  }

  // แสดงผลลัพธ์ออกทางตาราง UI HTML
  filteredHistory.forEach((item) => {
    const diffContent = buildDiffHtml(item.beforeData, item.afterData);

    container.innerHTML += `
      <tr style="border-bottom: 1px solid #222;">
        <td style="padding: 12px; color: #aaa; font-size: 0.85rem; white-space: nowrap; vertical-align: top;">📅 ${item.dateString || "-"}</td>
        <td style="padding: 12px; color: #4a90e2; font-weight: bold; vertical-align: top;">👤 ${item.adminName || "Admin"} <br><span style="font-size:0.75rem; color:#777;">(${item.adminEmail || "-"})</span></td>
        <td style="padding: 12px; color: #ff2a2a; font-weight: bold; vertical-align: top;">⚡ ${item.actionTitle || "-"}</td>
        <td style="padding: 12px; color: #ddd; font-size: 0.9rem; vertical-align: top;">
          <div>${item.actionDetail || "-"}</div>
          ${diffContent}
        </td>
      </tr>
    `;
  });
};