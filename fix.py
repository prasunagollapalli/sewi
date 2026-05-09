import os

with open('main.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('  // --- Navigation Logic ---')

if start_idx != -1:
    clean_nav = """  // --- Navigation Logic ---
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
    noBtn.addEventListener('mouseover', () => {
      const x = Math.random() * (window.innerWidth - noBtn.offsetWidth - 20) + 10;
      const y = Math.random() * (window.innerHeight - noBtn.offsetHeight - 20) + 10;
      noBtn.style.position = 'fixed';
      noBtn.style.left = `${x}px`;
      noBtn.style.top = `${y}px`;
      noBtn.style.zIndex = '1000';
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
    sendFeedbackBtn.addEventListener('click', () => {
      const msg = feedbackMessageInput ? feedbackMessageInput.value.trim() : '';
      if (!msg) {
        alert('Please write a message first!');
        return;
      }
      const username = localStorage.getItem('currentUserName');
      const user = siteConfig.users.find(u => u.username === username);
      if (user) {
        user.receiverFeedback = msg;
        saveSiteConfig();
        sendFeedbackBtn.style.display = 'none';
        feedbackMessageInput.style.display = 'none';
        if (feedbackSuccessMsg) feedbackSuccessMsg.classList.remove('hidden');
      }
    });
  }

  // --- INIT ---
  loadSiteConfig();
  checkAuth();
});
"""
    content = content[:start_idx] + clean_nav
    with open('main.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed main.js via Python!")
else:
    print("Start index not found")
