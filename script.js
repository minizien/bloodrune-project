// นำเข้า Firebase Modules แบบ ES Module
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ตั้งค่า Firebase Config ของโครงการ BloodRune
const firebaseConfig = {
  apiKey: "AIzaSyA-SB3kOtVOK0xwEt2xjF6JJHZKPYhNURY",
  authDomain: "bloodrune-project.firebaseapp.com",
  projectId: "bloodrune-project",
  storageBucket: "bloodrune-project.firebasestorage.app",
  messagingSenderId: "394744755352",
  appId: "1:394744755352:web:0af156b7f8c888dc164ced",
  measurementId: "G-B6BX636YH3"
};

// เริ่มต้นใช้งาน Firebase, Auth & Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', () => {
  // ----------------------------------------------------
  // 0. ระบบตรวจสอบการถูกแบนแบบ Real-time (Force Logout)
  // ----------------------------------------------------
  try {
    const rawUserData = localStorage.getItem('userData');
    if (rawUserData) {
      const parsedUser = JSON.parse(rawUserData);
      const currentUid = parsedUser.uid;

      if (currentUid && currentUid !== 'N/A') {
        onSnapshot(doc(db, "users", currentUid), (docSnap) => {
          if (docSnap.exists()) {
            const userInfo = docSnap.data();
            if (userInfo.isBanned === true || userInfo.status === 'banned') {
              alert("⚠️ บัญชีของคุณถูกระงับการใช้งาน (Banned) กรุณาติดต่อผู้ดูแลระบบ");
              localStorage.removeItem('userData');
              localStorage.removeItem('userToken');
              localStorage.removeItem('userLoggedIn');
              window.location.href = 'login-signin.html';
            }
          }
        });
      }
    }
  } catch (err) {
    console.error("Ban Listener Error:", err);
  }

  // ----------------------------------------------------
  // 1. ตรวจสอบสถานะผู้ใช้งาน (Auth Status & Profile Click)
  // ----------------------------------------------------
  checkAuthStatus();

  const authBtn = document.getElementById('auth-btn');
  if (authBtn) {
    authBtn.addEventListener('click', () => {
      try {
        const rawData = localStorage.getItem('userData');
        const userData = rawData ? JSON.parse(rawData) : null;

        if (userData && (userData.nickname || userData.email)) {
          openProfileModal();
        } else {
          location.href = 'login-signin.html';
        }
      } catch (e) {
        console.error("Auth Click Error:", e);
        location.href = 'login-signin.html';
      }
    });
  }

  // ----------------------------------------------------
  // 2. ระบบค้นหาข้อมูล Real-time จาก Firebase Firestore
  // ----------------------------------------------------
  const searchInput = document.querySelector('.search-input');
  const searchButton = document.querySelector('.search-button');

  if (searchInput) {
    const searchContainer = searchInput.closest('.search-Lobby') || searchInput.parentElement;
    searchContainer.style.position = 'relative';

    const resultsBox = document.createElement('div');
    resultsBox.className = 'search-results-dropdown';
    resultsBox.style.cssText = `
      position: absolute;
      top: 105%;
      left: 0;
      width: 100%;
      background: #141414;
      border: 1px solid #ff2a2a;
      border-radius: 6px;
      max-height: 350px;
      overflow-y: auto;
      z-index: 1000;
      display: none;
      box-shadow: 0 8px 25px rgba(0,0,0,0.8);
      text-align: left;
    `;
    searchContainer.appendChild(resultsBox);

    async function searchFirebaseDocs(query) {
      if (!query) {
        resultsBox.style.display = 'none';
        resultsBox.innerHTML = '';
        return;
      }

      resultsBox.innerHTML = `<div style="padding: 15px; text-align: center; color: #ff2a2a; font-size: 0.9rem;">🔍 กำลังค้นหาข้อมูล...</div>`;
      resultsBox.style.display = 'block';

      try {
        const searchResults = [];

        try {
          const projSnap = await getDocs(collection(db, "projects"));
          projSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (!data.hidden) {
              const name = data.name || '';
              const desc = data.description || 'โปรเจกต์พัฒนา BloodRune';
              if (name.toLowerCase().includes(query) || desc.toLowerCase().includes(query)) {
                searchResults.push({
                  title: name,
                  desc: desc,
                  category: 'PROJECT',
                  url: 'Project.html'
                });
              }
            }
          });
        } catch (e) {
          console.warn("ไม่พบข้อมูลใน 'projects':", e);
        }

        try {
          const prodSnap = await getDocs(collection(db, "products"));
          prodSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (!data.hidden) {
              const name = data.name || '';
              const desc = data.description || '';
              if (name.toLowerCase().includes(query) || desc.toLowerCase().includes(query)) {
                searchResults.push({
                  title: name,
                  desc: `ราคา: ${data.price || 0} Gold - ${desc}`,
                  category: 'STORE',
                  url: 'Store.html'
                });
              }
            }
          });
        } catch (e) {
          console.warn("ไม่พบข้อมูลใน 'products':", e);
        }

        try {
          const newsSnap = await getDocs(collection(db, "news"));
          newsSnap.forEach(docSnap => {
            const data = docSnap.data();
            const title = data.title || '';
            const content = data.content || data.description || '';
            if (title.toLowerCase().includes(query) || content.toLowerCase().includes(query)) {
              searchResults.push({
                title: title,
                desc: content,
                category: 'NEWS',
                url: 'News.html'
              });
            }
          });
        } catch (e) {
          console.warn("ไม่พบข้อมูลใน 'news':", e);
        }

        if (searchResults.length > 0) {
          resultsBox.innerHTML = searchResults.map(item => `
            <a href="${item.url}" style="display: block; padding: 12px 15px; border-bottom: 1px solid #222; text-decoration: none; color: #fff; transition: background 0.2s;" onmouseover="this.style.background='#220a0a'" onmouseout="this.style.background='transparent'">
              <div style="font-size: 0.75rem; color: #ff2a2a; font-weight: bold; margin-bottom: 3px;">[${item.category}]</div>
              <div style="font-size: 0.95rem; font-weight: 600; color: #ffffff; margin-bottom: 3px;">${item.title}</div>
              <div style="font-size: 0.8rem; color: #aaa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.desc}</div>
            </a>
          `).join('');
        } else {
          resultsBox.innerHTML = `<div style="padding: 15px; text-align: center; color: #888; font-size: 0.9rem;">ไม่พบข้อมูลที่ตรงกับ "${query}" ในฐานข้อมูล</div>`;
        }
      } catch (err) {
        console.error("Search Error:", err);
        resultsBox.innerHTML = `<div style="padding: 15px; text-align: center; color: #ff4d4d; font-size: 0.85rem;">เกิดข้อผิดพลาดในการดึงข้อมูล</div>`;
      }
    }

    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      const query = e.target.value.trim().toLowerCase();
      debounceTimer = setTimeout(() => {
        searchFirebaseDocs(query);
      }, 400);
    });

    if (searchButton) {
      searchButton.addEventListener('click', () => {
        const query = searchInput.value.trim().toLowerCase();
        searchFirebaseDocs(query);
      });
    }

    document.addEventListener('click', (e) => {
      if (!searchContainer.contains(e.target)) {
        resultsBox.style.display = 'none';
      }
    });
  }

  // ----------------------------------------------------
  // 3. ระบบ Image Slider ในหน้า Lobby
  // ----------------------------------------------------
  const slider = document.getElementById('slider');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  
  if (slider && prevBtn && nextBtn) {
    let currentSlide = 0;
    const slides = document.querySelectorAll('.slide-page');
    const totalSlides = slides.length;

    function updateSlider() {
      slider.style.transform = `translateX(-${currentSlide * 100}%)`;
    }

    nextBtn.addEventListener('click', () => {
      currentSlide = (currentSlide + 1) % totalSlides;
      updateSlider();
    });

    prevBtn.addEventListener('click', () => {
      currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
      updateSlider();
    });

    setInterval(() => {
      currentSlide = (currentSlide + 1) % totalSlides;
      updateSlider();
    }, 5000);
  }
});

// ----------------------------------------------------
// Global Profile & Auth Functions
// ----------------------------------------------------

function checkAuthStatus() {
  const authBtn = document.getElementById('auth-btn');
  if (!authBtn) return;

  try {
    const rawData = localStorage.getItem('userData');
    if (!rawData) {
      authBtn.innerText = 'Login / Sign In';
      return;
    }

    const userData = JSON.parse(rawData);
    if (userData && (userData.nickname || userData.email)) {
      authBtn.innerText = userData.nickname || userData.email.split('@')[0];
    } else {
      authBtn.innerText = 'Login / Sign In';
    }
  } catch (e) {
    console.error("Auth Status Error:", e);
    authBtn.innerText = 'Login / Sign In';
  }
}

// ตรวจสอบสิทธิ์ Admin จาก Firestore โดยตรง ป้องกันการปลอมแปลง localStorage
async function openProfileModal() {
  try {
    const rawData = localStorage.getItem('userData');
    const userData = rawData ? JSON.parse(rawData) : {};

    const setElemText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.innerText = text;
    };

    setElemText('prof-nickname', userData.nickname || '-');
    setElemText('prof-age', userData.age || '-');
    setElemText('prof-dob', userData.dob || '-');
    setElemText('prof-email', userData.email || '-');

    let userRole = userData.RoleUser || userData.role || 'Member';
    setElemText('prof-role', userRole.toUpperCase());

    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) {
      adminBtn.style.display = 'none';

      const currentUser = auth.currentUser;
      if (currentUser) {
        const userDocRef = doc(db, "users", currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const dbData = userDocSnap.data();
          userRole = dbData.RoleUser || userRole;
          setElemText('prof-role', userRole.toUpperCase());

          if (userRole.toLowerCase() === 'admin' || dbData.isAdmin === true) {
            adminBtn.style.display = 'block';
          }
        }
      }
    }

    const profileModal = document.getElementById('profileModal');
    if (profileModal) {
      profileModal.classList.add('active');
    }
  } catch (e) {
    console.error("Open Profile Error:", e);
    alert("เกิดข้อผิดพลาดในการโหลดข้อมูลโปรไฟล์");
  }
}

window.closeProfile = function() {
  const profileModal = document.getElementById('profileModal');
  if (profileModal) {
    profileModal.classList.remove('active');
  }
};

window.handleLogout = function() {
  localStorage.removeItem('userData');
  alert('ออกจากระบบเรียบร้อยแล้ว');
  location.reload();
};