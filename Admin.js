import { db, auth } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { initProjectModule } from "./PJadmin.js";
import { initNewsModule } from "./NWadmin.js";
import { initStoreModule } from "./STRadmin.js";
import { initUsersModule } from "./USadmin.js";
import { initHistoryModule } from "./HTowner.js";
import { initLobbyAdminModule } from "./LBadmin.js";

window.isAdminOwner = false;

window.switchTab = function (tabId, btnElement) {
  document.querySelectorAll(".tab-content").forEach((tab) => {
    tab.style.display = "none";
    tab.classList.remove("active");
  });
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.classList.remove("active");
  });
  
  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.style.display = "block";
    targetTab.classList.add("active");
  }
  if (btnElement) {
    btnElement.classList.add("active");
  }

  if (tabId === 'historyTab' && typeof window.renderAdminHistory === 'function') {
    window.renderAdminHistory();
  }
};

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
      const roleUser = (userData.RoleUser || userData.role || "").trim().toUpperCase();

      if (roleUser !== "ADMIN" && roleUser !== "OWNER" && userData.isAdmin !== true) {
        alert("❌ สมาชิกทั่วไปไม่มีสิทธิ์เข้าถึงโซนแอดมิน!");
        window.location.href = "index.html";
        return;
      }

      // เช็คว่าเป็น Owner แท้จริงหรือไม่
      window.isAdminOwner = (roleUser === "OWNER" || user.email === "owner@bloodrune.com");

      // 🛑 จัดการซ่อน/แสดงปุ่มเมนูพิเศษ (Lobby Control & History)
      const lobbyTabBtn = document.getElementById("navTabLobby");
      const historyTabBtn = document.getElementById("navTabHistory");

      if (window.isAdminOwner) {
        if (lobbyTabBtn) lobbyTabBtn.style.display = "block";
        if (historyTabBtn) historyTabBtn.style.display = "block";
      } else {
        // หากเป็น Admin ธรรมดา ให้ซ่อนปุ่มถาวรทันที
        if (lobbyTabBtn) lobbyTabBtn.style.display = "none";
        if (historyTabBtn) historyTabBtn.style.display = "none";
      }

    } else {
      alert("❌ ไม่พบข้อมูลโปรไฟล์ผู้ใช้งานในระบบ");
      window.location.href = "index.html";
      return;
    }
    
    initModules();
  } catch (err) {
    console.error("Auth verification error:", err);
    alert("❌ เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์: " + err.message);
    window.location.href = "index.html";
  }
});

function initModules() {
  initProjectModule();
  initNewsModule();
  initStoreModule();
  initUsersModule();
  
  if (window.isAdminOwner) {
    initHistoryModule();
    initLobbyAdminModule();
  }
}
