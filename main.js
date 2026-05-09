import './style.css'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

document.addEventListener('DOMContentLoaded', () => {
  // --- Supabase Helper Logic ---
  const dbHelper = {
    async saveUserConfig(userData) {
      const { data, error } = await supabase
        .from('users')
        .upsert(userData, { onConflict: 'sender_username' })
        .select();
      if (error) throw error;
      return data[0];
    },
    async getUserDataByReceiver(username, password) {
      const { data, error } = await supabase
        .from('users')
        .select('*, memories(image_url, description)')
        .eq('receiver_username', username)
        .eq('receiver_password', password)
        .single();
      if (error) return null;
      return data;
    },
    async getUserDataBySender(username, password) {
      const { data, error } = await supabase
        .from('users')
        .select('*, memories(image_url, description)')
        .eq('sender_username', username)
        .eq('sender_password', password)
        .single();
      if (error) return null;
      return data;
    },
    async getAllUsersForAdmin() {
      const { data, error } = await supabase
        .from('users')
        .select('*, memories(image_url, description)');
      if (error) throw error;
      return data;
    },
    async deleteUser(userId) {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);
      if (error) throw error;
    },
    async uploadFile(bucket, path, file) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);
      return publicUrl;
    },
    async saveMemories(userId, memories) {
      // First delete old memories
      await supabase.from('memories').delete().eq('user_id', userId);
      // Then insert new ones
      if (memories.length > 0) {
        const memoryData = memories.map(m => ({ 
            user_id: userId, 
            image_url: m.image_url, 
            description: m.description || "" 
        }));
        const { error } = await supabase.from('memories').insert(memoryData);
        if (error) throw error;
      }
    }
  };
  
  // --- Hidden Admin Logic ---
  let authorClickCount = 0;
  document.querySelectorAll('.author-trigger').forEach(el => {
    el.addEventListener('click', () => {
      authorClickCount++;
      if (authorClickCount >= 3) {
        const adminOption = document.getElementById('admin-option');
        if (adminOption) {
          adminOption.style.display = 'block';
          adminOption.parentElement.value = 'admin'; // Auto-select it
          alert("Admin access enabled! 🤫");
        }
      }
    });
  });

  let currentUserConfig = null; // Config of the logged-in user
  let currentMemories = [];
  let pendingMusicFile = null;
  let pendingBgImageFile = null;

  const homePage = document.getElementById('home-page');
  const openLoginBtn = document.getElementById('open-login-btn');
  const loginOverlay = document.getElementById('login-overlay');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const adminDashboard = document.getElementById('admin-dashboard');
  const logoutBtn = document.getElementById('logout-btn');
  const adminConfigForm = document.getElementById('admin-config-form');
  const userLogoutBtn = document.getElementById('user-logout-btn');
  const musicToggleBtn = document.getElementById('music-toggle');
  const bgMusic = document.getElementById('bg-music');

  let isPlaying = false;

  if (openLoginBtn) {
    openLoginBtn.addEventListener('click', () => {
      homePage.classList.add('hidden');
      loginOverlay.classList.remove('hidden');
    });
  }

  // --- Auth Logic ---
  function checkAuth() {
    // We clear the "auto-load" logic so it always starts at the Home Page
    // but we keep the session in localStorage so they don't have to re-type credentials
    // if they go to the login screen.
    
    homePage.classList.remove('hidden');
    loginOverlay.classList.add('hidden');
    adminDashboard.classList.add('hidden');
    stopMusic();
    
    // Reset to first page of the journey if they were in the middle of it
    navigateToPage('page-1');
  }

  function stopMusic() {
    if (bgMusic) {
      bgMusic.pause();
      bgMusic.currentTime = 0;
      isPlaying = false;
      if (musicToggleBtn) musicToggleBtn.innerText = '🎵';
    }
  }

  async function loadUserAndPlay(username) {
    const password = localStorage.getItem('receiverPassword');
    const userData = await dbHelper.getUserDataByReceiver(username, password);
    
    if (!userData) {
      console.error("User data not found for", username);
      return;
    }

    currentUserConfig = userData;
    currentMemories = userData.memories ? userData.memories.map(m => m.image_url) : [];

    applyConfig();

    // Auto Play Music
    if (bgMusic && bgMusic.src) {
      bgMusic.play().then(() => {
        isPlaying = true;
        if (musicToggleBtn) musicToggleBtn.innerText = '⏸️';
        if (typeof startMusicParticles === 'function') startMusicParticles();
      }).catch(e => {
        console.log("Auto-play blocked by browser. Waiting for user interaction...", e);
        const playOnClick = () => {
          bgMusic.play().then(() => {
            isPlaying = true;
            if (musicToggleBtn) musicToggleBtn.innerText = '⏸️';
            if (typeof startMusicParticles === 'function') startMusicParticles();
          }).catch(err => console.log("Playback failed:", err));
          document.removeEventListener('click', playOnClick);
        };
        document.addEventListener('click', playOnClick);
      });
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const role = document.getElementById('role-select').value;
    const username = e.target.username.value;
    const password = e.target.password.value;

    if (role === 'admin') {
      if (username === 'admin' && password === 'admin') {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userRole', 'admin');
        location.reload();
      } else {
        loginError.innerText = "Invalid admin credentials";
      }
    } else if (role === 'sender') {
      const userFound = await dbHelper.getUserDataBySender(username, password);
      if (userFound) {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userRole', 'sender');
        localStorage.setItem('currentUserName', userFound.sender_username);
        checkAuth();
      } else {
        // Automatically register new sender if not found (optional, or just error)
        try {
            const newUser = {
                sender_username: username,
                sender_password: password,
                from_name: defaultUserConfig.fromName,
                to_name: defaultUserConfig.toName,
                message: defaultUserConfig.message,
                relation: defaultUserConfig.relation,
                background_theme: defaultUserConfig.backgroundTheme
            };
            await dbHelper.saveUserConfig(newUser);
            
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('userRole', 'sender');
            localStorage.setItem('currentUserName', username);
            checkAuth();
        } catch (err) {
            loginError.innerText = "Error creating sender account. Use correct password if you already have one.";
        }
      }
    } else if (role === 'receiver') {
      const userFound = await dbHelper.getUserDataByReceiver(username, password);
      if (userFound) {
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userRole', 'receiver');
        localStorage.setItem('currentUserName', userFound.receiver_username);
        localStorage.setItem('receiverPassword', password); // Store to fetch data later
        checkAuth();
      } else {
        loginError.innerText = "Invalid receiver credentials";
      }
    }
  });

  function handleLogout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userRole');
    localStorage.removeItem('currentUserName');
    location.reload();
  }

  logoutBtn.addEventListener('click', handleLogout);
  if (userLogoutBtn) {
    userLogoutBtn.addEventListener('click', handleLogout);
  }

  // --- Admin Logic ---
  let editingUserIndex = -1; // -1 means no user selected
  let tempMemories = [];
  const editingIndicator = document.getElementById('editing-indicator');
  const currentEditingUserSpan = document.getElementById('current-editing-user');

  async function renderAdminDashboard() {
    const role = localStorage.getItem('userRole');

    if (role === 'admin') {
      document.querySelector('.admin-content h2').innerText = 'Admin Dashboard';
      document.getElementById('admin-user-management').style.display = 'block';
      document.getElementById('admin-config-form').style.display = 'none';
      if (editingIndicator) editingIndicator.style.display = 'none';
      await renderUserList();
    } else if (role === 'sender') {
      document.querySelector('.admin-content h2').innerText = 'Receiver Dashboard';
      document.getElementById('admin-user-management').style.display = 'none';
      const currentSender = localStorage.getItem('currentUserName');
      // For sender, we don't have password here, but we can fetch by username
      // (Security note: in a real app, use Supabase Auth for this)
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('sender_username', currentSender);
      
      if (users && users.length > 0) {
        loadUserForEditing(users[0]);
      }
    }
  }

  async function renderUserList() {
    const list = document.getElementById('user-list');
    if (!list) return;
    list.innerHTML = 'Loading users...';
    
    try {
        const users = await dbHelper.getAllUsersForAdmin();
        list.innerHTML = '';
        users.forEach((user) => {
          const li = document.createElement('li');
          li.classList.add('user-item');
          li.innerHTML = `
                <span><strong>${user.sender_username || 'Unknown Sender'}</strong> <small>(Receiver: ${user.receiver_username || 'Not set'})</small></span>
                <div style="font-size: 0.85rem; color: #666; margin-top: 5px; font-style: italic;">Feedback: ${user.receiver_feedback || 'None'}</div>
                <div style="margin-top: 10px;">
                    <button type="button" class="delete-user-btn" data-id="${user.id}">Delete</button>
                    <button type="button" class="edit-user-btn" data-id="${user.id}">Edit</button>
                </div>
            `;
          list.appendChild(li);
        });

        document.querySelectorAll('.delete-user-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            if (!confirm("Are you sure? This will delete all data for this user.")) return;
            const userId = e.target.getAttribute('data-id');
            await dbHelper.deleteUser(userId);
            renderAdminDashboard();
          });
        });

        document.querySelectorAll('.edit-user-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              const userId = e.target.getAttribute('data-id');
              const { data: user } = await supabase.from('users').select('*, memories(image_url, description)').eq('id', userId).single();
              if (user) loadUserForEditing(user);
            });
          });
    } catch (err) {
        list.innerHTML = 'Error loading users.';
    }
  }

  async function loadUserForEditing(user) {
    currentUserConfig = user; // Use the user object directly

    if (currentEditingUserSpan) currentEditingUserSpan.innerText = user.receiver_username || user.sender_username;

    // Populate Form
    document.getElementById('config-receiver-username').value = user.receiver_username || "";
    document.getElementById('config-receiver-password').value = user.receiver_password || "";
    const relationEl = document.getElementById('config-relation');
    if (relationEl) relationEl.value = user.relation || "partner";
    document.getElementById('config-from-name').value = user.from_name || defaultUserConfig.fromName;
    document.getElementById('config-to-name').value = user.to_name || defaultUserConfig.toName;
    document.getElementById('config-message').value = user.message || defaultUserConfig.message;
    document.getElementById('config-music-url').value = user.music_url || "";
    
    const themeEl = document.getElementById('config-background-theme');
    if (themeEl) themeEl.value = user.background_theme || "theme-default";
    
    const feedbackEl = document.getElementById('config-receiver-feedback');
    if (feedbackEl) feedbackEl.innerText = user.receiver_feedback || "No feedback received yet.";

    // Load Memories from the user object (already joined)
    tempMemories = user.memories ? user.memories.map(m => ({ 
        image_url: m.image_url, 
        description: m.description || "" 
    })) : [];
    
    pendingMusicFile = null;
    pendingBgImageFile = null;

    if (document.getElementById('music-preview')) {
        document.getElementById('music-preview').innerHTML = user.music_url ? `Current Music: ${user.music_url.split('/').pop()} 🎵` : '';
    }
    
    if (document.getElementById('bg-preview')) {
        document.getElementById('bg-preview').innerHTML = user.bg_image_url ? `Current Background: ${user.bg_image_url.split('/').pop()} 🖼️` : '';
    }

    renderPreviews();

    adminConfigForm.style.display = 'block';
    if (editingIndicator) editingIndicator.style.display = 'block';
    
    // Scroll to form
    adminConfigForm.scrollIntoView({ behavior: 'smooth' });
  }

  const addUserBtn = document.getElementById('add-user-btn');
  if (addUserBtn) {
    addUserBtn.addEventListener('click', async () => {
      const newUsername = document.getElementById('new-sender-username').value.trim();
      const newPassword = document.getElementById('new-sender-password').value.trim();

      if (newUsername && newPassword) {
        try {
            const newUser = {
                sender_username: newUsername,
                sender_password: newPassword,
                from_name: defaultUserConfig.fromName,
                to_name: defaultUserConfig.toName,
                message: defaultUserConfig.message,
                relation: defaultUserConfig.relation,
                background_theme: defaultUserConfig.backgroundTheme
            };
            await dbHelper.saveUserConfig(newUser);

            document.getElementById('new-sender-username').value = '';
            document.getElementById('new-sender-password').value = '';

            renderAdminDashboard();
        } catch (err) {
            alert("Error creating user: " + err.message);
        }
      } else {
        alert("Please enter both sender username and password.");
      }
    });
  }

  adminConfigForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserConfig) return;

    const saveBtn = adminConfigForm.querySelector('.save-btn');
    const originalBtnText = saveBtn.innerText;
    saveBtn.innerText = 'Saving...';
    saveBtn.disabled = true;

    try {
      const user = currentUserConfig;
      
      // Update User Config Object
      const updates = {
        id: user.id,
        receiver_username: document.getElementById('config-receiver-username').value,
        receiver_password: document.getElementById('config-receiver-password').value,
        relation: document.getElementById('config-relation').value,
        from_name: document.getElementById('config-from-name').value,
        to_name: document.getElementById('config-to-name').value,
        message: document.getElementById('config-message').value,
        music_url: document.getElementById('config-music-url').value,
        background_theme: document.getElementById('config-background-theme').value
      };

      // Handle File Uploads
      if (pendingMusicFile) {
        const path = `${user.id}/music_${Date.now()}_${pendingMusicFile.name}`;
        updates.music_url = await dbHelper.uploadFile('assets', path, pendingMusicFile);
      }

      if (pendingBgImageFile) {
        const path = `${user.id}/bg_${Date.now()}_${pendingBgImageFile.name}`;
        updates.bg_image_url = await dbHelper.uploadFile('assets', path, pendingBgImageFile);
      }

      // Save User Data
      await supabase.from('users').update(updates).eq('id', user.id);

      // Save Memories
      // Note: tempMemories contains objects { image_url, description }
      const uploadedMemories = await Promise.all(tempMemories.map(async (m, i) => {
          let url = m.image_url;
          if (url.startsWith('data:')) {
              const res = await fetch(url);
              const blob = await res.blob();
              const file = new File([blob], `memory_${i}_${Date.now()}.jpg`, { type: 'image/jpeg' });
              const path = `${user.id}/memories/${file.name}`;
              url = await dbHelper.uploadFile('memories', path, file);
          }
          return { image_url: url, description: m.description };
      }));

      await dbHelper.saveMemories(user.id, uploadedMemories);

      alert(`Saved configuration successfully!`);
      location.reload();
    } catch (err) {
      alert("Error saving configuration! " + err.message);
      console.error(err);
    } finally {
        saveBtn.innerText = originalBtnText;
        saveBtn.disabled = false;
    }
  });


  // --- Drag & Drop Specifics for Admin ---
  const dropZone = document.getElementById('drop-zone');
  const imageInput = document.getElementById('image-input');
  const previewContainer = document.getElementById('preview-container');

  function renderPreviews() {
    previewContainer.innerHTML = '';
    tempMemories.forEach((m, index) => {
      const wrapper = document.createElement('div');
      wrapper.classList.add('preview-wrapper');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '5px';
      wrapper.style.background = '#fff';
      wrapper.style.padding = '10px';
      wrapper.style.borderRadius = '10px';
      wrapper.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';

      const img = document.createElement('img');
      img.src = m.image_url;
      img.classList.add('preview-img');
      img.title = "Click to remove";
      img.style.width = '100px';
      img.style.height = '100px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '5px';
      img.style.cursor = 'pointer';
      
      img.addEventListener('click', () => {
        tempMemories.splice(index, 1);
        renderPreviews();
      });

      const descInput = document.createElement('input');
      descInput.type = 'text';
      descInput.placeholder = 'Add a caption...';
      descInput.value = m.description || '';
      descInput.style.width = '100%';
      descInput.style.fontSize = '0.8rem';
      descInput.style.padding = '5px';
      descInput.addEventListener('click', (e) => e.stopPropagation());
      descInput.addEventListener('input', (e) => {
        m.description = e.target.value;
      });

      wrapper.appendChild(img);
      wrapper.appendChild(descInput);
      previewContainer.appendChild(wrapper);
    });
  }

  if (dropZone && imageInput) {
    dropZone.addEventListener('click', () => imageInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });
    imageInput.addEventListener('change', (e) => handleFiles(e.target.files));
  }

  function handleFiles(files) {
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          tempMemories.push({ image_url: e.target.result, description: "" });
          renderPreviews();
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Music Drag & Drop
  const musicDropZone = document.getElementById('music-drop-zone');
  const musicInput = document.getElementById('music-upload');
  const musicPreview = document.getElementById('music-preview');

  if (musicDropZone && musicInput) {
    musicDropZone.addEventListener('click', () => musicInput.click());
    musicDropZone.addEventListener('dragover', (e) => { e.preventDefault(); musicDropZone.classList.add('dragover'); });
    musicDropZone.addEventListener('dragleave', () => musicDropZone.classList.remove('dragover'));
    musicDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      musicDropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) handleMusicFile(e.dataTransfer.files[0]);
    });
    musicInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleMusicFile(e.target.files[0]);
    });
  }

  function handleMusicFile(file) {
    if (file.type.startsWith('audio/')) {
      pendingMusicFile = file;
      musicPreview.innerHTML = `Selected: ${file.name} 🎵`;
      musicPreview.style.color = '#e91e63';
    } else {
      alert("Please upload an audio file.");
    }
  }


  
  // Background Image Drag & Drop
  const bgDropZone = document.getElementById('bg-drop-zone');
  const bgInput = document.getElementById('bg-image-upload');
  const bgPreview = document.getElementById('bg-preview');

  if (bgDropZone && bgInput) {
    bgDropZone.addEventListener('click', () => bgInput.click());
    bgDropZone.addEventListener('dragover', (e) => { e.preventDefault(); bgDropZone.classList.add('dragover'); });
    bgDropZone.addEventListener('dragleave', () => bgDropZone.classList.remove('dragover'));
    bgDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      bgDropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) handleBgFile(e.dataTransfer.files[0]);
    });
    bgInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleBgFile(e.target.files[0]);
    });
  }

  function handleBgFile(file) {
    if (file.type.startsWith('image/')) {
      pendingBgImageFile = file;
      bgPreview.innerHTML = `Selected: ${file.name} ???`;
      bgPreview.style.color = '#e91e63';
    } else {
      alert("Please upload an image file.");
    }
  }

  // --- Content Loader (Initialization) ---
  const romanticQuotes = [
    "Every love story is beautiful, but ours is my favorite.",
    "You are my today and all of my tomorrows.",
    "I look at you and see the rest of my life in front of my eyes.",
    "My heart is and always will be yours.",
    "In you, I've found the love of my life and my closest, truest friend.",
    "I love you more than words can wield the matter, Dearer than eye-sight, space, and liberty.",
    "If I had a flower for every time I thought of you... I could walk through my garden forever.",
    "You are the finest, loveliest, tenderest, and most beautiful person I have ever known.",
    "To be brave is to love someone unconditionally, without expecting anything in return.",
    "I swear I couldn't love you more than I do right now, and yet I know I will tomorrow."
  ];

  const defaultUserConfig = {
    relation: "friend",
    fromName: "Your Name",
    toName: "My Dearest Friend",
    message: `Dear Friend,\n\nI wanted to take a moment to appreciate everything you are. You bring so much light into the world...`,
    backgroundTheme: "theme-default"
  };

  function applyConfig() {
    if (!currentUserConfig) return;

    // Update Title (To Name)
    const titleEl = document.querySelector('.title');
    if (titleEl) titleEl.innerText = `For ${currentUserConfig.to_name}`;

    // Update Envelope From Name
    const envelopeFromEl = document.getElementById('envelope-from-name');
    if (envelopeFromEl) {
      envelopeFromEl.innerText = `From: ${currentUserConfig.from_name}`;
    }

    // Apply Background Theme
    const bgAnimation = document.querySelector('.background-animation');
    if (bgAnimation) {
      bgAnimation.className = 'background-animation';
      bgAnimation.style.backgroundImage = ''; 
      bgAnimation.style.backgroundColor = 'transparent';
      
      if (currentUserConfig.bg_image_url) {
        bgAnimation.style.backgroundImage = `url(${currentUserConfig.bg_image_url})`;
        bgAnimation.style.backgroundSize = 'cover';
        bgAnimation.style.backgroundPosition = 'center';
        bgAnimation.style.backgroundRepeat = 'no-repeat';
        bgAnimation.style.animation = 'none'; 
      } else {
        const theme = currentUserConfig.background_theme || 'theme-default';
        bgAnimation.classList.add(theme);
        bgAnimation.style.zIndex = '-1';
        bgAnimation.style.backgroundColor = 'var(--bg-color)';
        bgAnimation.style.backgroundSize = '400% 400%';
        bgAnimation.style.animation = 'gradientBG 15s ease infinite';
      }
    }

    // Update Music Source
    if (currentUserConfig.music_url && bgMusic) {
      bgMusic.src = currentUserConfig.music_url;
    }

    // Update Memories Gallery
    const galleryGrid = document.querySelector('.gallery-grid');
    if (galleryGrid) {
      galleryGrid.innerHTML = '';

      if (currentUserConfig.memories && currentUserConfig.memories.length > 0) {
        currentUserConfig.memories.forEach(m => {
          const rotation = (Math.random() * 10 - 5).toFixed(2);
          const delay = (Math.random() * 5).toFixed(2);

          const card = document.createElement('div');
          card.classList.add('memory-card');
          card.style.setProperty('--rotation', `${rotation}deg`);
          card.style.setProperty('--delay', `${delay}s`);

          card.addEventListener('click', () => {
            const animations = ['animate-heartbeat', 'animate-flip', 'animate-pop', 'animate-wiggle'];
            const randomAnim = animations[Math.floor(Math.random() * animations.length)];
            card.classList.add(randomAnim);
            card.addEventListener('animationend', () => {
              card.classList.remove(randomAnim);
            }, { once: true });
          });

          // Use memory-specific description or fall back to random quote
          const caption = m.description || romanticQuotes[Math.floor(Math.random() * romanticQuotes.length)];
          card.innerHTML = `<img src="${m.image_url}" alt="Our Memory"><p class="memory-quote">"${caption}"</p>`;
          galleryGrid.appendChild(card);
        });
      } else {
        galleryGrid.innerHTML = `
          <div class="gallery-item placeholder">Photo 1</div>
          <div class="gallery-item placeholder">Photo 2</div>
          <div class="gallery-item placeholder">Photo 3</div>
        `;
      }
    }
  }

  // --- Envelope & Letter Logic ---
  const envelopeContainer = document.getElementById('envelope');
  const letterModal = document.getElementById('letter-modal');
  const closeLetterBtn = document.getElementById('close-letter');
  const typewriterElement = document.getElementById('typewriter');
  let isEnvelopeOpen = false;

  // Envelope Themes
  const envelopeThemes = [
    { bg: '#f8bbd0', flap: '#f48fb1', body: '#fce4ec', seal: '❤️' }, // Pink
    { bg: '#bbdefb', flap: '#90caf9', body: '#e3f2fd', seal: '💙' }, // Blue
    { bg: '#e1bee7', flap: '#ce93d8', body: '#f3e5f5', seal: '💜' }, // Purple
    { bg: '#fff9c4', flap: '#fff59d', body: '#fffde7', seal: '💛' }, // Yellow/Gold
    { bg: '#ffcdd2', flap: '#ef9a9a', body: '#ffebee', seal: '💌' }, // Red
  ];

  function randomizeEnvelopeTheme() {
    const theme = envelopeThemes[Math.floor(Math.random() * envelopeThemes.length)];
    document.documentElement.style.setProperty('--envelope-bg', theme.bg);
    document.documentElement.style.setProperty('--flap-bg', theme.flap);
    document.documentElement.style.setProperty('--body-bg', theme.body);
    document.documentElement.style.setProperty('--seal-content', `"${theme.seal}"`);
  }

  envelopeContainer.addEventListener('click', () => {
    if (!isEnvelopeOpen) {
      isEnvelopeOpen = true;
      envelopeContainer.classList.add('open');
      setTimeout(() => {
        letterModal.classList.remove('hidden');
        void letterModal.offsetWidth;
        letterModal.classList.add('visible');

        // Use User Message
        const msg = currentUserConfig ? currentUserConfig.message : "Hello...";
        startTypewriter(msg, typewriterElement);
      }, 800);
    }
  });

  closeLetterBtn.addEventListener('click', () => {
    letterModal.classList.remove('visible');
    setTimeout(() => {
      letterModal.classList.add('hidden');

      // Reset Envelope
      envelopeContainer.classList.remove('open');
      isEnvelopeOpen = false;

      // Change Theme for next time
      randomizeEnvelopeTheme();

    }, 300);
  });

  function startTypewriter(text, element) {
    element.innerHTML = '';
    let i = 0;
    element.style.whiteSpace = 'pre-line';
    function type() {
      if (i < text.length) {
        element.innerHTML += text.charAt(i);
        i++;
        setTimeout(type, 50);
      }
    }
    type();
  }

  // --- Music Toggle & Particles ---
  let musicInterval = null;

  function createMusicParticle() {
    if (!musicToggleBtn) return;
    const rect = musicToggleBtn.getBoundingClientRect();

    const particle = document.createElement('div');
    particle.classList.add('music-particle');

    const symbols = ['🎵', '🎶', '❤️', '💖'];
    particle.innerText = symbols[Math.floor(Math.random() * symbols.length)];

    // Starting position relative to button center
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;

    particle.style.left = `${startX}px`;
    particle.style.top = `${startY}px`;

    document.body.appendChild(particle);

    setTimeout(() => particle.remove(), 2000);
  }

  function startMusicParticles() {
    if (musicInterval) clearInterval(musicInterval);
    createMusicParticle(); // Immediate one
    musicInterval = setInterval(createMusicParticle, 600);
  }

  function stopMusicParticles() {
    if (musicInterval) clearInterval(musicInterval);
    musicInterval = null;
  }

  function stopMusic() {
    if (bgMusic) {
      bgMusic.pause();
      bgMusic.currentTime = 0;
      // isPlaying and particles handled by events
    }
  }

  // --- Music Toggle ---
  if (musicToggleBtn) {
    musicToggleBtn.addEventListener('click', () => {
      if (bgMusic.paused) {
        bgMusic.play().catch(e => console.log("Audio play failed:", e));
      } else {
        bgMusic.pause();
      }
    });
  }

  // --- Robust Audio Events ---
  if (bgMusic) {
    bgMusic.addEventListener('play', () => {
      isPlaying = true;
      if (musicToggleBtn) musicToggleBtn.innerText = '⏸️';
      startMusicParticles();
    });

    bgMusic.addEventListener('pause', () => {
      isPlaying = false;
      if (musicToggleBtn) musicToggleBtn.innerText = '🎵';
      stopMusicParticles();
    });

    bgMusic.addEventListener('ended', () => {
      isPlaying = false;
      if (musicToggleBtn) musicToggleBtn.innerText = '🎵';
      stopMusicParticles();
    });
  }


  // --- Visual Effects (Floating, Bursts) ---

  // --- Gallery Scroll ---
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  });

  const heroFloatingContainer = document.getElementById('hero-floating');
  const emojis = ['🌸', '🌹', '🌺', '🌷', '💐', '❤️', '💖', '✨', '🦋'];

  if (heroFloatingContainer) {
    function createFloatingElement() {
      const el = document.createElement('div');
      el.classList.add('float-item');
      el.innerText = emojis[Math.floor(Math.random() * emojis.length)];
      const left = Math.random() * 100;
      const duration = Math.random() * 10 + 5;
      const size = Math.random() * 1.5 + 1;

      el.style.left = `${left}%`;
      el.style.animationDuration = `${duration}s`;
      el.style.fontSize = `${size}rem`;

      // Click to escape
      el.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent other clicks
        el.classList.add('escaped');
        createBurst(e.clientX, e.clientY); // Optional: add burst too
        setTimeout(() => el.remove(), 500);
      });

      heroFloatingContainer.appendChild(el);

      setTimeout(() => {
        if (el.parentNode) el.remove();
      }, duration * 1000);
    }
    setInterval(createFloatingElement, 500);
    for (let i = 0; i < 10; i++) { setTimeout(createFloatingElement, i * 200); }
  }

  function createBurst(x, y, customEmojis = null) {
    const defaultEmojis = ['💖', '✨', '🌸', '🎉', '❤️'];
    const burstEmojis = customEmojis || defaultEmojis;
    const particleCount = 12;

    for (let i = 0; i < particleCount; i++) {
      const el = document.createElement('div');
      el.classList.add('burst-particle');
      el.innerText = burstEmojis[Math.floor(Math.random() * burstEmojis.length)];
      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * 100 + 50;
      const tx = Math.cos(angle) * velocity;
      const ty = Math.sin(angle) * velocity;
      const rot = Math.random() * 360;

      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.setProperty('--tx', `${tx}px`);
      el.style.setProperty('--ty', `${ty}px`);
      el.style.setProperty('--rot', `${rot}deg`);

      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1000);
    }
  }

  document.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      createBurst(e.clientX, e.clientY);
    });
  });

  // --- Branding Interactions ---
  const siteLogo = document.getElementById('site-logo');
  const welcomeTitle = document.getElementById('welcome-title');
  const welcomeLogo = document.getElementById('welcome-logo');
  const randomEmojiSets = [
    ['🦄', '🌈', '✨', '🍭'],
    ['🐯', '🦁', '🐻', '🐼'],
    ['🍎', '🍓', '🍒', '🍉'],
    ['⚽', '🏀', '🏈', '⚾'],
    ['😀', '😂', '😎', '😍'],
    ['🚀', '🛸', '⭐', '🌌']
  ];

  function handleBrandingClick(e) {
    const randomSet = randomEmojiSets[Math.floor(Math.random() * randomEmojiSets.length)];
    createBurst(e.clientX, e.clientY, randomSet);
  }

  if (siteLogo) {
      siteLogo.addEventListener('click', (e) => {
          handleBrandingClick(e);
          handleLogout(); // Redirect to home/login
      });
  }
  if (welcomeTitle) welcomeTitle.addEventListener('click', handleBrandingClick);
  if (welcomeLogo) welcomeLogo.addEventListener('click', handleBrandingClick);

  const homeBtn = document.getElementById('home-btn');
  if (homeBtn) {
      homeBtn.addEventListener('click', () => {
          handleLogout(); // Return to start
      });
  }

  // --- Cake Intro Logic ---
  const cakeIntro = document.getElementById('cake-intro');
  const page2Content = document.getElementById('page-2-content');
  const flame = document.querySelector('.flame');

  if (cakeIntro && page2Content) {
    cakeIntro.addEventListener('click', () => {
      // 1. Extinguish Candle
      if (flame) {
        flame.style.opacity = '0';
        flame.style.animation = 'none';
      }

      // 2. Smoke Effect
      const candle = document.querySelector('.candle');
      if (candle) {
        for (let i = 0; i < 8; i++) {
          const smoke = document.createElement('div');
          smoke.classList.add('smoke-particle');
          smoke.style.left = `50%`;
          smoke.style.animationDelay = `${i * 0.1}s`;
          candle.appendChild(smoke);
        }
      }

      // 3. Floating Hearts
      const cake = cakeIntro.querySelector('.cake');
      if (cake) {
        for (let i = 0; i < 10; i++) {
          const heart = document.createElement('div');
          heart.classList.add('cake-heart');
          heart.innerText = '❤️';
          heart.style.left = `${Math.random() * 100}%`;
          heart.style.top = `${Math.random() * -50}px`;
          heart.style.fontSize = `${Math.random() * 1 + 1}rem`;
          heart.style.animationDelay = `${Math.random() * 0.5}s`;
          cake.appendChild(heart);
        }
      }

      // 4. Fade out after delay
      setTimeout(() => {
        cakeIntro.classList.add('fade-out');

        setTimeout(() => {
          cakeIntro.style.display = 'none';
          page2Content.classList.remove('hidden');
          page2Content.classList.add('fade-in-up');
        }, 1000);
      }, 2000); // Wait for smoke/hearts
    });
  }

  // --- Navigation Logic ---
  const pages = document.querySelectorAll('.page');
  const navButtons = document.querySelectorAll('.nav-btn');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      if (!targetId) return;
      
      navigateToPage(targetId);

      if (bgMusic && bgMusic.paused && bgMusic.src) {
        bgMusic.play().then(() => {
          isPlaying = true;
          if (musicToggleBtn) musicToggleBtn.innerText = '??';
          if (typeof startMusicParticles === 'function') startMusicParticles();
        }).catch(e => console.log('Play on nav failed:', e));
      }
    });
  });

  function navigateToPage(pageId) {
    pages.forEach(page => page.classList.remove('active'));
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
      targetPage.classList.add('active');
      if (pageId === 'page-2') {
        const envelope = document.getElementById('envelope');
        if(envelope) envelope.classList.remove('open');
        const p2c = document.getElementById('page-2-content');
        if(p2c) p2c.classList.add('hidden');
        const ci = document.getElementById('cake-intro');
        if(ci) ci.classList.remove('hidden');
        if(typeof resetCake === 'function') resetCake();
      }
    }
  }

  // --- Conclusion Page Logic ---
  const noBtn = document.getElementById('no-btn');
  const yesBtn = document.getElementById('yes-btn');
  const feedbackFormContainer = document.getElementById('feedback-form-container');
  const sendFeedbackBtn = document.getElementById('send-feedback-btn');
  const feedbackMessageInput = document.getElementById('feedback-message');
  const feedbackSuccessMsg = document.getElementById('feedback-success-msg');

  if (noBtn) {
    noBtn.addEventListener('mouseover', (e) => {
      const padding = 50;
      const x = Math.random() * (window.innerWidth - noBtn.offsetWidth - padding * 2) + padding;
      const y = Math.random() * (window.innerHeight - noBtn.offsetHeight - padding * 2) + padding;
      
      noBtn.style.position = 'fixed';
      noBtn.style.transition = 'all 0.15s ease-out';
      noBtn.style.left = `${x}px`;
      noBtn.style.top = `${y}px`;
      noBtn.style.zIndex = '9999';
    });
    
    // Extra insurance: jump if click is somehow registered
    noBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const padding = 50;
        const x = Math.random() * (window.innerWidth - noBtn.offsetWidth - padding * 2) + padding;
        const y = Math.random() * (window.innerHeight - noBtn.offsetHeight - padding * 2) + padding;
        noBtn.style.left = `${x}px`;
        noBtn.style.top = `${y}px`;
    });
  }

  if (yesBtn) {
    yesBtn.addEventListener('click', () => {
      if (noBtn) noBtn.style.display = 'none';
      yesBtn.style.display = 'none';
      if (feedbackFormContainer) feedbackFormContainer.classList.remove('hidden');
    });
  }

  if (sendFeedbackBtn) {
    sendFeedbackBtn.addEventListener('click', async () => {
      const msg = feedbackMessageInput ? feedbackMessageInput.value.trim() : '';
      if (!msg) {
        alert('Please write a message first!');
        return;
      }
      
      if (currentUserConfig) {
        try {
            const { error } = await supabase
                .from('users')
                .update({ receiver_feedback: msg })
                .eq('id', currentUserConfig.id);
            
            if (error) throw error;

            sendFeedbackBtn.style.display = 'none';
            feedbackMessageInput.style.display = 'none';
            if (feedbackSuccessMsg) feedbackSuccessMsg.classList.remove('hidden');
        } catch (err) {
            alert('Error sending message: ' + err.message);
        }
      }
    });
  }

  // --- INIT ---
  checkAuth();
});
