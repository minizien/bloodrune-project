import { db, auth } from "./firebase-config.js";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { logAdminAction } from "./HTowner.js";

export let users = [];
let currentUserRole = "member"; // เก็บสถานะยศของผู้ใช้งานปัจจุบัน

export function initUsersModule() {
  // ตรวจสอบยศผู้ใช้งานปัจจุบันจาก Firebase Auth และ Firestore โดยตรงทันที
  const authUser = auth.currentUser;
  if (authUser) {
    getDoc(doc(db, "users", authUser.uid)).then((docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        currentUserRole = (data.RoleUser || data.role || data.Role || "").trim().toUpperCase();
        renderUsers();
      }
    }).catch(() => {});
  }

  onSnapshot(collection(db, "users"), (snapshot) => {
    users = [];
    snapshot.forEach((docSnap) => {
      users.push({ firebaseId: docSnap.id, ...docSnap.data() });
    });
    renderUsers();
  });
}

window.renderUsers = function() {
  const tbody = document.getElementById("userTable") || document.getElementById("userTableBody");
  if (!tbody) return;

  const searchUserInput = document.getElementById("adminUserSearch");
  const keyword = searchUserInput ? searchUserInput.value.toLowerCase().trim() : "";
  tbody.innerHTML = "";

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">ยังไม่มีข้อมูลผู้ใช้ในระบบ</td></tr>';
    return;
  }

  // ✅ ตรวจสอบสิทธิ์ OWNER จากตัวแปรกลาง หรือดึงสำรองจาก localStorage
  const localUser = JSON.parse(localStorage.getItem("userData") || "{}");
  const localRole = (localUser.RoleUser || localUser.role || localUser.Role || "").toUpperCase();
  
  const isOwner = (currentUserRole === "OWNER" || localRole === "OWNER");

  users.filter(u => (u.nickname || u.name || "").toLowerCase().includes(keyword) || (u.email || "").toLowerCase().includes(keyword)).forEach((u) => {
    const isBanned = u.status === "Banned";
    
    // ดึงยศของผู้ใช้ในแต่ละแถว
    let userRole = (u.RoleUser || u.role || u.Role || "").trim().toUpperCase();
    if (!userRole) {
      userRole = u.isAdmin === true ? "ADMIN" : "MEMBER";
    }
    
    let roleBadgeColor = "#aaa";
    if (userRole === "OWNER") roleBadgeColor = "#ff1e27";
    else if (userRole === "ADMIN") roleBadgeColor = "#f0ad4e";

    // ✅ หากเป็น OWNER จะแสดงปุ่ม "ลบ" เพิ่มขึ้นมาข้างๆ ปุ่มแบนทันที
    const deleteButtonHtml = isOwner ? `
      <button class="btn-secondary" style="background:#c9302c; color:#fff; padding:3px 8px; cursor:pointer; font-weight:bold;" onclick="deleteUser('${u.firebaseId}')">ลบ</button>
    ` : "";

    tbody.innerHTML += `
      <tr>
        <td>${u.nickname || u.name || "-"}</td>
        <td>${u.email || "-"}</td>
        <td><strong style="color:${roleBadgeColor}">${userRole}</strong></td>
        <td><span style="color:${isBanned ? "#ff2a2a" : "#28a745"}">${u.status || "Active"}</span></td>
        <td>
          <button class="btn-secondary" style="background:${isBanned ? "#28a745" : "#f0ad4e"}; color:${isBanned ? "#fff" : "#000"}; padding:3px 8px; cursor:pointer;" onclick="toggleBanUser('${u.firebaseId}')">${isBanned ? "ปลดแบน" : "แบน"}</button>
          ${deleteButtonHtml}
        </td>
      </tr>
    `;
  });
};

window.toggleBanUser = async function (firebaseId) {
  const localUser = JSON.parse(localStorage.getItem("userData") || "{}");
  const activeRole = (currentUserRole || localUser.RoleUser || localUser.role || "").toUpperCase();

  if (activeRole !== "ADMIN" && activeRole !== "OWNER") {
    alert("⚠️ คุณไม่มีสิทธิ์จัดการสถานะผู้ใช้!");
    return;
  }

  const u = users.find(item => item.firebaseId === firebaseId);
  if (!u) return;
  
  const targetRole = (u.RoleUser || u.role || u.Role || "").toUpperCase();
  if (targetRole === "OWNER") {
    alert("⚠️ ไม่สามารถแบนผู้ใช้งานระดับ OWNER ได้!");
    return;
  }

  const newStatus = u.status === "Banned" ? "Active" : "Banned";
  const targetName = u.nickname || u.name || u.email || firebaseId;

  if (confirm(`ยืนยันเปลี่ยนสถานะผู้ใช้ "${targetName}" เป็น "${newStatus}"?`)) {
    try {
      await updateDoc(doc(db, "users", u.firebaseId), { status: newStatus });
      await logAdminAction(
        newStatus === "Banned" ? "แบนผู้ใช้งาน" : "ปลดแบนผู้ใช้งาน", 
        `เปลี่ยนสถานะผู้ใช้ "${targetName}" (${u.email || "-"}) เป็น "${newStatus}"`
      );
      alert("✅ อัปเดตสถานะสำเร็จ!");
    } catch (err) {
      console.error(err);
      alert("❌ เกิดข้อผิดพลาด: " + err.message);
    }
  }
};

window.deleteUser = async function (firebaseId) {
  const localUser = JSON.parse(localStorage.getItem("userData") || "{}");
  const activeRole = (currentUserRole || localUser.RoleUser || localUser.role || "").toUpperCase();

  if (activeRole !== "OWNER") {
    alert("⚠️ เฉพาะผู้ใช้งานระดับ OWNER เท่านั้นที่มีสิทธิ์ลบบัญชีผู้ใช้!");
    return;
  }

  const u = users.find(item => item.firebaseId === firebaseId);
  const targetRole = u ? (u.RoleUser || u.role || u.Role || "").toUpperCase() : "";
  
  if (targetRole === "OWNER") {
    alert("⚠️ ไม่สามารถลบบัญชีระดับ OWNER ด้วยกันได้!");
    return;
  }

  const targetName = u ? (u.nickname || u.name || u.email || firebaseId) : firebaseId;

  if (confirm(`⚠️ ยืนยันลบบัญชีผู้ใช้ "${targetName}" ออกจากระบบถาวร?`)) {
    try {
      await deleteDoc(doc(db, "users", firebaseId));
      await logAdminAction("ลบบัญชีผู้ใช้", `ลบบัญชีผู้ใช้งาน "${targetName}" ออกจากระบบถาวร`);
      alert("✅ ลบผู้ใช้สำเร็จ!");
    } catch (err) {
      alert("❌ เกิดข้อผิดพลาด: " + err.message);
    }
  }
};