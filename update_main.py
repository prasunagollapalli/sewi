import os
import re

with open("main.js", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update saveUserData signature and object
content = content.replace(
    'saveUserData(username, memories, musicFile) {',
    'saveUserData(username, memories, musicFile, bgImageFile) {'
)
content = content.replace(
    'const data = { username, memories, musicFile };',
    'const data = { username, memories, musicFile, bgImageFile };'
)

# 2. Global variables
content = content.replace(
    'let currentMusicFile = null;',
    'let currentMusicFile = null;\n  let pendingBgImageFile = null;\n  let currentBgImageFile = null;'
)

# 3. In loadUserForEditing
content = content.replace(
    'pendingMusicFile = null;',
    'pendingMusicFile = null;\n    pendingBgImageFile = null;'
)
content = content.replace(
    '''if (document.getElementById('music-preview')) {
        document.getElementById('music-preview').innerHTML = userData && userData.musicFile ? `Saved: ${userData.musicFile.name} ??` : '';
        if (userData && userData.musicFile) document.getElementById('music-preview').style.color = '#4caf50';
    }''',
    '''if (document.getElementById('music-preview')) {
        document.getElementById('music-preview').innerHTML = userData && userData.musicFile ? `Saved: ${userData.musicFile.name} ??` : '';
        if (userData && userData.musicFile) document.getElementById('music-preview').style.color = '#4caf50';
    }
    
    if (document.getElementById('bg-preview')) {
        document.getElementById('bg-preview').innerHTML = userData && userData.bgImageFile ? `Saved: ${userData.bgImageFile.name} ???` : '';
        if (userData && userData.bgImageFile) document.getElementById('bg-preview').style.color = '#4caf50';
    }'''
)

# 4. BG image upload events
bg_events = '''
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
'''

content = content.replace(
    '// --- Content Loader (Initialization) ---',
    bg_events + '\n  // --- Content Loader (Initialization) ---'
)

# 5. adminConfigForm submit
content = content.replace(
    '''      let musicToSave = pendingMusicFile;
      if (!musicToSave) {
        const existingData = await dbHelper.getUserData(user.username);
        if (existingData) musicToSave = existingData.musicFile;
      }

      await dbHelper.saveUserData(user.username, tempMemories, musicToSave);''',
    '''      let musicToSave = pendingMusicFile;
      let bgToSave = pendingBgImageFile;
      const existingData = await dbHelper.getUserData(user.username);
      if (!musicToSave && existingData) musicToSave = existingData.musicFile;
      if (!bgToSave && existingData) bgToSave = existingData.bgImageFile;

      await dbHelper.saveUserData(user.username, tempMemories, musicToSave, bgToSave);'''
)

# 6. Check Auth
content = content.replace(
    '''            const userData = await dbHelper.getUserData(userFound.username);
            currentMemories = userData && userData.memories ? userData.memories : [];
            currentMusicFile = userData && userData.musicFile ? userData.musicFile : null;''',
    '''            const userData = await dbHelper.getUserData(userFound.username);
            currentMemories = userData && userData.memories ? userData.memories : [];
            currentMusicFile = userData && userData.musicFile ? userData.musicFile : null;
            currentBgImageFile = userData && userData.bgImageFile ? userData.bgImageFile : null;'''
)

# 7. Apply Config
content = content.replace(
    '''    // Apply Background Theme
    const bgAnimation = document.querySelector('.background-animation');
    if (bgAnimation) {
      // Remove any existing theme classes
      bgAnimation.className = 'background-animation';
      const theme = currentUserConfig.backgroundTheme || 'theme-default';
      bgAnimation.classList.add(theme);
    }''',
    '''    // Apply Background Theme
    const bgAnimation = document.querySelector('.background-animation');
    if (bgAnimation) {
      // Remove any existing theme classes
      bgAnimation.className = 'background-animation';
      bgAnimation.style.backgroundImage = ''; // Clear custom image
      
      if (currentBgImageFile) {
        const url = URL.createObjectURL(currentBgImageFile);
        bgAnimation.style.backgroundImage = `url(${url})`;
        bgAnimation.style.backgroundSize = 'cover';
        bgAnimation.style.backgroundPosition = 'center';
      } else {
        const theme = currentUserConfig.backgroundTheme || 'theme-default';
        bgAnimation.classList.add(theme);
        bgAnimation.style.backgroundSize = '400% 400%';
      }
    }'''
)

with open("main.js", "w", encoding="utf-8") as f:
    f.write(content)

print("Updated main.js")
