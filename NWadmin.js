import { db } from "./firebase-config.js";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { logAdminAction } from "./HTowner.js";

export let news = [];

// ✅ ฟังก์ชันที่ Admin.js เรียกใช้งานเพื่อเริ่มโมดูลข่าวสาร
export function initNewsModule() {
  const newsQuery = query(collection(db, "news"), orderBy("date", "desc"));
  onSnapshot(newsQuery, (snapshot) => {
    news = [];
    snapshot.forEach((docSnap) => {
      news.push({ firebaseId: docSnap.id, ...docSnap.data() });
    });
    renderNews();
  });
}

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

  const filteredNews = news.filter(n => (n.title || "").toLowerCase().includes(keyword) || (n.content || "").toLowerCase().includes(keyword));

  filteredNews.forEach((n) => {
    const index = news.indexOf(n);
    
    let imagesHtml = "";
    if (n.imageUrl) {
      const urls = n.imageUrl.split(/[\n,]+/).map(u => u.trim()).filter(u => u.length > 0);
      if (urls.length > 0) {
        let imgsGrid = "";
        urls.forEach(url => {
          imgsGrid += `<div style="flex: 0 0 100px; height: 70px; border-radius: 4px; overflow: hidden; background: #000; border: 1px solid #333;"><img src="${url}" alt="News Image" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.style.display='none'"/></div>`;
        });
        imagesHtml = `<div style="display: flex; gap: 8px; overflow-x: auto; margin-top: 6px; margin-bottom: 6px; padding-bottom: 4px;">${imgsGrid}</div>`;
      }
    }

    container.innerHTML += `
      <div class="news-card" style="background:#181818; border:1px solid #333; padding:12px; border-radius:6px; margin-bottom:10px;">
        <h4>${n.title}</h4>
        <p style="color:#aaa; font-size:0.85rem; margin:4px 0;">${n.content}</p>
        ${imagesHtml}
        <div style="font-size:0.75rem; color:#777; margin-top:6px;">📅 วันที่ประกาศ: ${n.date || "-"}</div>
        <div style="display: flex; gap: 6px; margin-top: 8px;">
          <button class="btn-secondary" style="background:#f0ad4e; color:#000;" onclick="editNews(${index})">✏️ แก้ไข</button>
          <button class="btn-secondary" style="background:#c9302c;" onclick="deleteNews(${index})">🗑️ ลบ</button>
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
        title, 
        content, 
        imageUrl, 
        updatedAtString: currentDateTime 
      });
      await logAdminAction("แก้ไขข่าวสารส่วนกลาง", `แก้ไขหัวข้อข่าวสาร: "${title}"`);
    } else {
      await addDoc(collection(db, "news"), { 
        title, 
        content, 
        imageUrl, 
        date: currentDateTime, 
        createdAt: serverTimestamp() 
      });
      await logAdminAction("สร้างข่าวสารส่วนกลาง", `สร้างข่าวสารใหม่หัวข้อ: "${title}"`);
    }
    window.closeNewsModal();
    alert("✅ บันทึกข่าวสารสำเร็จ!");
  } catch (err) { 
    alert("❌ เกิดข้อผิดพลาด: " + err.message); 
  }
};

window.deleteNews = async function (index) {
  const n = news[index];
  const newsTitle = n ? (n.title || "ข่าวสาร") : "ข่าวสาร";

  if (confirm(`ยืนยันลบข่าวสาร "${newsTitle}" นี้?`)) {
    try {
      await deleteDoc(doc(db, "news", n.firebaseId));
      await logAdminAction("ลบข่าวสารส่วนกลาง", `ลบข่าวสารหัวข้อ: "${newsTitle}" ออกจากระบบ`);
      alert("✅ ลบสำเร็จ!");
    } catch (err) {
      alert("❌ ลบไม่สำเร็จ: " + err.message);
    }
  }
};