import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { logAdminAction } from "./HTowner.js";

let lobbyAnnouncements = [];

// ตรวจสอบสิทธิ์ Owner
async function checkIsOwner() {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return false;

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      const uData = userDoc.data();
      const roleUser = (uData.RoleUser || uData.role || "").toLowerCase();
      if (roleUser === "owner" || uData.isAdmin === true || user.email === "owner@bloodrune.com") {
        return true;
      }
    }
  } catch (err) {
    console.error("Error checking owner permission:", err);
  }
  return false;
}

// โหลดข้อมูลประกาศจาก Firebase Firestore (settings/lobby)
async function getStoredAnnouncements() {
  try {
    const docRef = doc(db, "settings", "lobby");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().announcements || [];
    } else {
      // ถ้ายังไม่มี Document ให้สร้างโครงสร้างเริ่มต้นไว้ทันที
      await setDoc(docRef, { announcements: [] });
      return [];
    }
  } catch (e) {
    console.error("Load announcements from Firestore error:", e);
    return [];
  }
}

// บันทึกข้อมูลประกาศลง Firebase Firestore
async function saveStoredAnnouncements(data) {
  try {
    await setDoc(doc(db, "settings", "lobby"), { announcements: data }, { merge: true });
  } catch (e) {
    console.error("Save announcements to Firestore error:", e);
    alert("เกิดข้อผิดพลาดในการบันทึกข้อมูลลง Firebase: " + e.message);
  }
}

export async function initLobbyAdminModule() {
  const isOwner = await checkIsOwner();
  const container = document.getElementById("lobbyAdminContainer");
  
  if (!container) return;

  if (!isOwner) {
    container.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; padding: 20px; border-radius: 8px; text-align: center;">
        <h3 style="color: #ef4444; margin-bottom: 8px;">จำกัดสิทธิ์เฉพาะ Owner เท่านั้น</h3>
        <p style="color: #ccc; font-size: 0.9rem;">คุณไม่มีสิทธิ์ในการจัดการประกาศลอยหรือตั้งค่าหน้า Lobby ส่วนนี้สงวนไว้สำหรับ Owner เท่านั้น</p>
      </div>
    `;
    return;
  }

  lobbyAnnouncements = await getStoredAnnouncements();
  if (typeof window.renderLobbyAnnouncementsAdmin === 'function') {
    window.renderLobbyAnnouncementsAdmin();
  }
}

window.renderLobbyAnnouncementsAdmin = async function() {
  const listContainer = document.getElementById("lobbyAnnouncementsList");
  if (!listContainer) return;

  lobbyAnnouncements = await getStoredAnnouncements();
  listContainer.innerHTML = "";

  if (lobbyAnnouncements.length === 0) {
    listContainer.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">ยังไม่มีประกาศลอยในระบบ Lobby (รองรับสูงสุด 3 ประกาศ)</p>';
    return;
  }

  lobbyAnnouncements.forEach((item, index) => {
    const isActive = item.active !== false;
    const statusBadge = isActive 
      ? '<span style="background: #10b981; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;">แสดงผลอยู่</span>' 
      : '<span style="background: #555; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;">ปิดการแสดงผล</span>';

    listContainer.innerHTML += `
      <div style="background: #181818; border: 1px solid #333; padding: 14px; border-radius: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; gap: 15px; flex-wrap: wrap;">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
            <h4 style="color: #fff; margin: 0; font-size: 0.95rem;">ประกาศลอยลำดับที่ ${index + 1}</h4>
            ${statusBadge}
          </div>
          <div style="font-size: 0.85rem; color: #aaa; word-break: break-all; margin-bottom: 3px;">รูปภาพ: <a href="${item.imageUrl}" target="_blank" style="color: #3b82f6;">${item.imageUrl}</a></div>
          <div style="font-size: 0.85rem; color: #aaa; word-break: break-all;">ลิงก์นำทาง: ${item.targetUrl ? `<a href="${item.targetUrl}" target="_blank" style="color: #10b981;">${item.targetUrl}</a>` : '<span style="color: #777;">(ไม่มี)</span>'}</div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="banner-action-btn" style="background: #f59e0b; color: #000; padding: 6px 12px; font-size: 0.85rem; cursor: pointer;" onclick="toggleLobbyAnnouncementStatus(${index})">${isActive ? 'ซ่อน' : 'แสดง'}</button>
          <button class="banner-action-btn" style="background: #c9302c; color: #fff; padding: 6px 12px; font-size: 0.85rem; cursor: pointer;" onclick="deleteLobbyAnnouncement(${index})">ลบ</button>
        </div>
      </div>
    `;
  });
};

window.openLobbyAnnouncementModal = async function() {
  lobbyAnnouncements = await getStoredAnnouncements();
  if (lobbyAnnouncements.length >= 3) {
    alert("ประกาศลอยจำกัดสูงสุดไม่เกิน 3 อันครับ! กรุณาลบประกาศเดิมออกก่อนสร้างใหม่");
    return;
  }
  const modal = document.getElementById("lobbyAnnouncementModal");
  if (modal) modal.classList.add("open");
};

window.closeLobbyAnnouncementModal = function() {
  const modal = document.getElementById("lobbyAnnouncementModal");
  if (modal) modal.classList.remove("open");
};

window.handleSaveLobbyAnnouncement = async function(e) {
  e.preventDefault();
  const isOwner = await checkIsOwner();
  if (!isOwner) {
    alert("ปฏิเสธการเข้าถึง: เฉพาะ Owner เท่านั้นที่สามารถสร้างประกาศได้!");
    return;
  }

  lobbyAnnouncements = await getStoredAnnouncements();
  if (lobbyAnnouncements.length >= 3) {
    alert("ไม่สามารถสร้างเกิน 3 ประกาศได้!");
    return;
  }

  const imageUrl = document.getElementById("lobbyAnnImage").value.trim();
  const targetUrl = document.getElementById("lobbyAnnTargetUrl").value.trim();

  if (!imageUrl) {
    alert("กรุณากรอกลิงก์รูปภาพประกาศ");
    return;
  }

  lobbyAnnouncements.push({
    imageUrl,
    targetUrl: targetUrl || "",
    active: true
  });

  await saveStoredAnnouncements(lobbyAnnouncements);

  try {
    await logAdminAction("สร้างประกาศลอย Lobby", `Owner ได้สร้างประกาศลอยรูปภาพใหม่ (รวมเป็น ${lobbyAnnouncements.length}/3)`);
  } catch (err) {
    console.warn("Log admin action warning:", err);
  }

  window.closeLobbyAnnouncementModal();
  document.getElementById("lobbyAnnounceForm").reset();
  await window.renderLobbyAnnouncementsAdmin();
  alert("สร้างประกาศลอยรูปภาพและบันทึกลง Firebase สำเร็จ!");
};

window.toggleLobbyAnnouncementStatus = async function(index) {
  const isOwner = await checkIsOwner();
  if (!isOwner) {
    alert("เฉพาะ Owner เท่านั้นที่มีสิทธิ์แก้ไข!");
    return;
  }

  lobbyAnnouncements = await getStoredAnnouncements();
  if (lobbyAnnouncements[index]) {
    lobbyAnnouncements[index].active = lobbyAnnouncements[index].active === false ? true : false;
    await saveStoredAnnouncements(lobbyAnnouncements);
    await window.renderLobbyAnnouncementsAdmin();
    alert("เปลี่ยนแปลงสถานะประกาศสำเร็จ!");
  }
};

window.deleteLobbyAnnouncement = async function(index) {
  const isOwner = await checkIsOwner();
  if (!isOwner) { 
    alert("เฉพาะ Owner เท่านั้นที่มีสิทธิ์ลบประกาศ!");
    return;
  }

  if (confirm("ยืนยันการลบประกาศลอยรูปภาพนี้ออกจาก Lobby?")) {
    lobbyAnnouncements = await getStoredAnnouncements();
    lobbyAnnouncements.splice(index, 1);
    await saveStoredAnnouncements(lobbyAnnouncements);

    try {
      await logAdminAction("ลบประกาศลอย Lobby", `Owner ได้ลบประกาศลอยออก`);
    } catch (err) {
      console.warn("Log admin action warning:", err);
    }

    await window.renderLobbyAnnouncementsAdmin();
    alert("ลบประกาศสำเร็จ!");
  }
};
