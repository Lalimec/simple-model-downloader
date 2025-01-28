import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Ensure we only create one instance
let buttonInstance = null;

class DownloadButton {
    constructor() {
        if (buttonInstance) {
            return buttonInstance;
        }
        
        this.button = this.createButton();
        this.modal = document.createElement('dialog');
        this.modal.style.cssText = `
            background: var(--comfy-menu-bg);
            color: var(--comfy-text);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 20px;
            max-width: 400px;
        `;
        
        this.directories = [];
        this.lastSelectedPath = localStorage.getItem('modelDownloader.lastPath') || 'loras';
        this._handlePathChange = null;  // Store the event handler reference
        this.setupModal();
        this.addToMenu();
        
        // Initial directory load
        this.loadDirectories();
        
        buttonInstance = this;
    }

    updateLastSelectedPath(path) {
        this.lastSelectedPath = path;
        localStorage.setItem('modelDownloader.lastPath', path);
    }

    async loadDirectories() {
        try {
            const response = await fetch('/simple-model-downloader/directories');
            const data = await response.json();
            if (data.success) {
                this.directories = data.directories;
                const select = document.getElementById('save-path');
                if (select) {
                    // Remove existing event listener if it exists
                    if (this._handlePathChange) {
                        select.removeEventListener('change', this._handlePathChange);
                    }

                    // Update options
                    select.innerHTML = this.directories.map(dir => {
                        const displayName = dir.path ? dir.path.split('/').join(' → ') : 'models';
                        const prefix = dir.special ? '📁 ' : '';
                        return `<option value="${dir.path}">${prefix}${displayName}</option>`;
                    }).join('');
                    
                    // Set the value after options are populated
                    const savedPath = localStorage.getItem('modelDownloader.lastPath');
                    if (savedPath && select.querySelector(`option[value="${savedPath}"]`)) {
                        select.value = savedPath;
                    } else if (select.querySelector('option[value="loras"]')) {
                        select.value = 'loras';
                        this.updateLastSelectedPath('loras');
                    } else {
                        select.value = '';  // Default to root if no valid options
                        this.updateLastSelectedPath('');
                    }

                    // Add new event listener
                    this._handlePathChange = (e) => {
                        this.updateLastSelectedPath(e.target.value);
                    };
                    select.addEventListener('change', this._handlePathChange);
                }
            } else {
                console.error('Failed to load directories:', data.error);
            }
        } catch (error) {
            console.error('Failed to load directories:', error);
        }
    }

    toggleNewFolderForm(show) {
        const container = document.getElementById('new-folder-container');
        const newFolderBtn = document.getElementById('new-folder-btn');
        if (container && newFolderBtn) {
            container.style.display = show ? 'block' : 'none';
            newFolderBtn.textContent = show ? 'Cancel' : 'New Folder';
            if (!show) {
                const input = document.getElementById('new-folder-name');
                if (input) input.value = '';
            }
        }
    }

    resetModalState() {
        const form = this.modal.querySelector('form');
        const progressContainer = document.getElementById('progress-container');
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');
        
        if (form) form.reset();
        if (progressContainer) progressContainer.style.display = 'none';
        if (progressBar) {
            progressBar.style.width = '0%';
            progressBar.style.backgroundColor = 'var(--comfy-active-color)';
        }
        if (progressText) progressText.textContent = '';
        
        this.toggleNewFolderForm(false);
        
        // Ensure the last selected path is maintained
        const select = document.getElementById('save-path');
        if (select) {
            const savedPath = localStorage.getItem('modelDownloader.lastPath');
            if (savedPath && select.querySelector(`option[value="${savedPath}"]`)) {
                select.value = savedPath;
            }
        }
    }

    setupModal() {
        const form = document.createElement('form');
        form.innerHTML = `
            <h3 style="margin-top: 0;">Basic Model Downloader</h3>
            <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 5px;">Model URL:</label>
                <input type="text" id="model-url" style="width: 100%; margin-bottom: 10px; 
                    background: var(--comfy-input-bg); color: var(--comfy-text); 
                    border: 1px solid var(--border-color); padding: 5px;">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">Model Name:</label>
                <input type="text" id="model-name" style="width: 100%; margin-bottom: 10px;
                    background: var(--comfy-input-bg); color: var(--comfy-text);
                    border: 1px solid var(--border-color); padding: 5px;">
            </div>
            <div style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <label>Save Location:</label>
                    <button type="button" id="new-folder-btn" style="
                        background: var(--comfy-input-bg);
                        border: 1px solid var(--border-color);
                        color: var(--comfy-text);
                        padding: 2px 8px;
                        cursor: pointer;
                        font-size: 0.9em;
                        border-radius: 4px;">New Folder</button>
                </div>
                <select id="save-path" style="width: 100%; background: var(--comfy-input-bg); 
                    color: var(--comfy-text); border: 1px solid var(--border-color); padding: 5px;">
                    <option value="loras">Loading...</option>
                </select>
            </div>
            <div id="new-folder-container" style="display: none; margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">New Folder Name:</label>
                <div style="display: flex; gap: 5px;">
                    <input type="text" id="new-folder-name" style="flex-grow: 1; background: var(--comfy-input-bg);
                        color: var(--comfy-text); border: 1px solid var(--border-color); padding: 5px;">
                    <button type="button" id="create-folder-btn" style="
                        background: var(--comfy-input-bg);
                        border: 1px solid var(--border-color);
                        color: var(--comfy-text);
                        padding: 5px 10px;
                        cursor: pointer;
                        min-width: 70px;">Create</button>
                </div>
            </div>
            <div id="progress-container" style="display: none; margin-bottom: 15px;">
                <div style="background: var(--comfy-input-bg); height: 20px; border-radius: 4px; overflow: hidden;">
                    <div id="progress-bar" style="width: 0%; height: 100%; background: var(--comfy-active-color); transition: width 0.3s;"></div>
                </div>
                <div id="progress-text" style="text-align: center; margin-top: 5px;"></div>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" id="cancel-btn" style="
                    background: var(--comfy-input-bg);
                    border: 1px solid var(--border-color);
                    color: var(--comfy-text);
                    padding: 5px 15px;
                    cursor: pointer;
                    min-width: 80px;">Cancel</button>
                <button type="submit" id="download-btn" style="
                    background: var(--comfy-input-bg);
                    border: 1px solid var(--border-color);
                    color: var(--comfy-text);
                    padding: 5px 15px;
                    cursor: pointer;
                    min-width: 80px;">Download</button>
            </div>
        `;

        this.modal.appendChild(form);
        document.body.appendChild(this.modal);

        // Load directories when modal opens
        this.modal.addEventListener('showModal', () => {
            this.loadDirectories();
            this.resetModalState();
        });

        // New folder button handler
        document.getElementById('new-folder-btn').addEventListener('click', () => {
            const container = document.getElementById('new-folder-container');
            this.toggleNewFolderForm(container.style.display === 'none');
        });

        // Create folder button handler
        document.getElementById('create-folder-btn').addEventListener('click', async () => {
            const folderName = document.getElementById('new-folder-name').value;
            const parentPath = document.getElementById('save-path').value;
            
            if (!folderName) {
                alert('Please enter a folder name');
                return;
            }

            try {
                const response = await fetch('/simple-model-downloader/create-folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ parent_path: parentPath, folder_name: folderName })
                });

                const data = await response.json();
                if (data.success) {
                    this.directories = data.directories;
                    const select = document.getElementById('save-path');
                    select.innerHTML = this.directories.map(dir => {
                        const displayName = dir.path ? dir.path.split('/').join(' → ') : 'models';
                        const prefix = dir.special ? '📁 ' : '';
                        return `<option value="${dir.path}">${prefix}${displayName}</option>`;
                    }).join('');
                    
                    // Select the newly created folder and update last selected path
                    const newPath = parentPath ? `${parentPath}/${folderName}` : folderName;
                    select.value = newPath;
                    this.updateLastSelectedPath(newPath);
                    
                    // Hide the new folder form and reset button
                    this.toggleNewFolderForm(false);
                } else {
                    alert(data.error || 'Failed to create folder');
                }
            } catch (error) {
                alert('Error creating folder: ' + error.message);
            }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = document.getElementById('model-url').value;
            const name = document.getElementById('model-name').value;
            const savePath = document.getElementById('save-path').value;
            
            if (!url || !name) {
                alert('Please fill in both URL and name fields');
                return;
            }

            try {
                // First check if the file exists
                const extension = url.split('?')[0].split('.').pop().toLowerCase();
                const checkResponse = await fetch('/simple-model-downloader/check-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        model_name: name, 
                        save_path: savePath,
                        extension: '.' + extension
                    })
                });

                const checkData = await checkResponse.json();
                if (!checkData.success) {
                    app.ui.notifications.error(checkData.error || 'Failed to check file existence');
                    return;
                }

                // If file exists, ask for confirmation
                if (checkData.exists) {
                    const confirmDialog = document.createElement('dialog');
                    confirmDialog.style.cssText = `
                        background: var(--comfy-menu-bg);
                        color: var(--comfy-text);
                        border: 1px solid var(--border-color);
                        border-radius: 8px;
                        padding: 20px;
                        max-width: 400px;
                    `;
                    
                    confirmDialog.innerHTML = `
                        <h3 style="margin-top: 0;">File Already Exists</h3>
                        <p>A file with the name "${checkData.file_path}" already exists.</p>
                        <p>Do you want to overwrite it?</p>
                        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                            <button id="no-btn" style="
                                background: var(--comfy-input-bg);
                                border: 1px solid var(--border-color);
                                color: var(--comfy-text);
                                padding: 5px 15px;
                                cursor: pointer;
                                min-width: 80px;">No</button>
                            <button id="yes-btn" style="
                                background: var(--comfy-input-bg);
                                border: 1px solid var(--border-color);
                                color: var(--comfy-text);
                                padding: 5px 15px;
                                cursor: pointer;
                                min-width: 80px;">Yes</button>
                        </div>
                    `;
                    
                    document.body.appendChild(confirmDialog);
                    confirmDialog.showModal();

                    return new Promise((resolve) => {
                        confirmDialog.querySelector('#yes-btn').addEventListener('click', () => {
                            confirmDialog.close();
                            confirmDialog.remove();
                            resolve(true);
                        });

                        confirmDialog.querySelector('#no-btn').addEventListener('click', () => {
                            confirmDialog.close();
                            confirmDialog.remove();
                            resolve(false);
                        });
                    }).then(async (shouldOverwrite) => {
                        if (!shouldOverwrite) {
                            return; // User chose not to overwrite
                        }
                        await startDownload();
                    });
                } else {
                    await startDownload();
                }
            } catch (error) {
                app.ui.notifications.error('Error checking file: ' + error.message);
            }

            async function startDownload() {
                const downloadBtn = document.getElementById('download-btn');
                const progressContainer = document.getElementById('progress-container');
                const progressBar = document.getElementById('progress-bar');
                const progressText = document.getElementById('progress-text');

                try {
                    downloadBtn.disabled = true;
                    progressContainer.style.display = 'block';
                    progressBar.style.width = '0%';
                    progressText.textContent = 'Starting download...';

                    const response = await fetch('/simple-model-downloader/download', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url, model_name: name, save_path: savePath })
                    });

                    const data = await response.json();
                    if (!data.success) {
                        app.ui.notifications.error(data.error || 'Download failed');
                        progressContainer.style.display = 'none';
                        progressText.textContent = '';
                    }
                } catch (error) {
                    app.ui.notifications.error('Error starting download: ' + error.message);
                    progressContainer.style.display = 'none';
                    progressText.textContent = '';
                } finally {
                    downloadBtn.disabled = false;
                }
            }
        });

        document.getElementById('cancel-btn').addEventListener('click', () => {
            this.modal.close();
        });

        // Modal close handler
        this.modal.addEventListener('close', () => {
            const select = document.getElementById('save-path');
            if (select && select.value) {
                this.updateLastSelectedPath(select.value);
            }
            // Reset the modal state after saving the path
            this.resetModalState();
        });
    }

    createButton() {
        const button = document.createElement('button');
        button.textContent = '⬇️ Basic Downloader';
        button.style.cssText = `
            background-color: transparent;
            border: none;
            color: var(--input-text);
            padding: 5px 10px;
            cursor: pointer;
            display: flex;
            align-items: center;
            width: 100%;
            text-align: left;
        `;
        
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = 'var(--comfy-menu-bg-hover)';
        });
        
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = 'transparent';
        });
        
        button.addEventListener('click', () => {
            this.modal.showModal();
        });

        return button;
    }

    addToMenu() {
        const container = document.createElement('div');
        container.style.padding = '0';
        container.appendChild(this.button);
        app.menu?.settingsGroup.element.before(container);
    }
}

// Create and add the button when the extension is loaded
app.registerExtension({
    name: 'ModelDownloader.Button',
    setup: () => {
        const downloader = new DownloadButton();
        
        // Listen for progress updates using ComfyUI's api events
        api.addEventListener("download-progress", ({ detail }) => {
            const progressBar = document.getElementById('progress-bar');
            const progressText = document.getElementById('progress-text');
            const progressContainer = document.getElementById('progress-container');
            const modal = document.querySelector('dialog');
            
            if (progressBar && progressText && progressContainer && modal?.open) {
                progressContainer.style.display = 'block';
                if (detail.percent !== undefined) {
                    progressBar.style.width = `${detail.percent}%`;
                    let statusText = `Downloading... ${detail.percent}%`;
                    if (detail.size) {
                        statusText += ` (${detail.size})`;
                    }
                    if (detail.speed) {
                        statusText += ` at ${detail.speed}`;
                    }
                    if (detail.message) {
                        statusText = detail.message;
                    }
                    progressText.textContent = statusText;
                    
                    if (detail.percent === 100) {
                        progressBar.style.backgroundColor = 'var(--success-color, #4CAF50)';
                        // Show success notification
                        app.ui.notifications.success(`✅ Model download completed successfully! (${detail.size || 'Unknown size'})`);
                        
                        // Clear input fields
                        const urlInput = document.getElementById('model-url');
                        const nameInput = document.getElementById('model-name');
                        if (urlInput) urlInput.value = '';
                        if (nameInput) nameInput.value = '';
                        
                        setTimeout(() => {
                            modal.close();
                            // Refresh directory list after successful download
                            downloader.loadDirectories();
                        }, 2000);  // Show completion message for 2 seconds
                    }
                }
            }
        });

        // Listen for download errors
        api.addEventListener("download-error", ({ detail }) => {
            const progressContainer = document.getElementById('progress-container');
            const progressBar = document.getElementById('progress-bar');
            const progressText = document.getElementById('progress-text');
            
            if (progressContainer && progressBar && progressText) {
                progressBar.style.backgroundColor = 'var(--error-text)';
                progressText.textContent = 'Download Error';
                app.ui.notifications.error(detail.error || 'Download failed');
            }
        });

        // Listen for download start
        api.addEventListener("download-start", () => {
            const progressContainer = document.getElementById('progress-container');
            const progressBar = document.getElementById('progress-bar');
            const progressText = document.getElementById('progress-text');
            
            if (progressContainer && progressBar && progressText) {
                progressContainer.style.display = 'block';
                progressBar.style.width = '0%';
                progressBar.style.backgroundColor = 'var(--comfy-active-color)';
                progressText.textContent = 'Starting download...';
            }
        });
    },
}); 