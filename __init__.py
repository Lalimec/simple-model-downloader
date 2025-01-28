import os
import asyncio
from aiohttp import web
import re
from server import PromptServer
import aiohttp

# Get the base models directory
BASE_MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.realpath(__file__)))), "models")

# Supported model extensions
SUPPORTED_EXTENSIONS = {'.safetensors', '.pt', '.ckpt', '.bin'}

def get_all_model_dirs():
    """Get all subdirectories in the models directory"""
    model_dirs = []
    
    # Add special directories first
    special_dirs = ["", "loras", "checkpoints", "diffusion_models"]
    for dir_path in special_dirs:
        if dir_path == "" or os.path.exists(os.path.join(BASE_MODELS_DIR, dir_path)):
            model_dirs.append({
                "path": dir_path,
                "name": dir_path if dir_path else "models",
                "special": True
            })
    
    # Get all other directories
    other_dirs = []
    for root, dirs, _ in os.walk(BASE_MODELS_DIR):
        rel_path = os.path.relpath(root, BASE_MODELS_DIR)
        if rel_path != "." and rel_path not in special_dirs:  # Skip special dirs since we added them already
            other_dirs.append({
                "path": rel_path,
                "name": os.path.basename(root),
                "special": False
            })
    
    # Sort other directories alphabetically by path
    other_dirs.sort(key=lambda x: x["path"].lower())
    
    # Combine special and other directories
    model_dirs.extend(other_dirs)
    
    return model_dirs

def get_extension_from_url(url):
    """Extract file extension from URL and validate it"""
    url_path = url.split('?')[0]  # Remove query parameters
    extension = os.path.splitext(url_path)[1].lower()
    if not extension:
        raise ValueError("URL has no file extension")
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file extension: {extension}. Supported extensions are: {', '.join(SUPPORTED_EXTENSIONS)}")
    return extension

def parse_wget_output(line: str) -> dict:
    """Parse wget output line to extract progress information."""
    progress = {}
    
    # Parse percentage and size info from progress bar format
    if 'K' in line or 'M' in line or 'G' in line:
        # Try to parse the download size and progress
        size_match = re.search(r'Length: (\d+)', line)
        if size_match:
            total_size = int(size_match.group(1))
            total_mb = total_size / (1024 * 1024)
            progress['size'] = f"{total_mb:.1f}MB"
            progress['percent'] = 0  # Starting download
            return progress

        # Parse progress line
        if '[' in line and ']' in line and '%' in line:
            percent_match = re.search(r'(\d+)%', line)
            if percent_match:
                progress['percent'] = int(percent_match.group(1))

        # Parse speed
        speed_match = re.search(r'(\d+\.?\d*[KMG]B/s)', line)
        if speed_match:
            progress['speed'] = speed_match.group(1)
            
    return progress

async def read_stream(stream, callback):
    """Read stream line by line and call callback for each line"""
    while True:
        line = await stream.readline()
        if not line:
            break
        line = line.decode().strip()
        if line:
            await callback(line)

async def create_folder(request):
    """Create a new folder under the specified path"""
    try:
        data = await request.json()
        parent_path = data.get('parent_path', '')
        folder_name = data.get('folder_name')
        
        if not folder_name:
            return web.json_response({'success': False, 'error': 'Folder name is required'})
            
        # Clean folder name
        folder_name = "".join([c for c in folder_name if c.isalnum() or c in ('-', '_', ' ')])
        
        # Create full path
        new_folder_path = os.path.join(BASE_MODELS_DIR, parent_path, folder_name)
        
        # Check if path exists
        if os.path.exists(new_folder_path):
            return web.json_response({'success': False, 'error': 'Folder already exists'})
            
        # Create folder
        os.makedirs(new_folder_path)
        
        # Return updated directory list
        return web.json_response({
            'success': True,
            'directories': get_all_model_dirs()
        })
        
    except Exception as e:
        return web.json_response({'success': False, 'error': str(e)})

async def get_directories(request):
    """Get list of all model directories"""
    try:
        return web.json_response({
            'success': True,
            'directories': get_all_model_dirs()
        })
    except Exception as e:
        return web.json_response({'success': False, 'error': str(e)})

async def validate_url(url):
    """Validate URL is accessible"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.head(url, allow_redirects=True) as response:
                if response.status != 200:
                    raise ValueError(f"URL returned status code {response.status}")
                return True
    except aiohttp.ClientError as e:
        raise ValueError(f"Failed to access URL: {str(e)}")

async def download_model(request):
    """Download a model using wget and track progress"""
    try:
        data = await request.json()
        url = data.get('url')
        model_name = data.get('model_name')
        save_path = data.get('save_path', 'loras')  # Default to loras directory
        
        if not url or not model_name:
            return web.json_response({'success': False, 'error': 'Missing URL or model name'})
        
        # Validate URL content before proceeding
        try:
            await validate_url(url)
        except ValueError as e:
            return web.json_response({'success': False, 'error': str(e)})
            
        try:
            # Get extension from URL and validate it
            url_extension = get_extension_from_url(url)
        except ValueError as e:
            return web.json_response({'success': False, 'error': str(e)})
        
        # Check if model_name already has a supported extension
        model_extension = os.path.splitext(model_name)[1].lower()
        if model_extension:
            if model_extension not in SUPPORTED_EXTENSIONS:
                return web.json_response({
                    'success': False, 
                    'error': f'Invalid extension: {model_extension}. Supported extensions are: {", ".join(SUPPORTED_EXTENSIONS)}'
                })
            # Ensure the model extension matches the URL extension
            if model_extension != url_extension:
                return web.json_response({
                    'success': False,
                    'error': f'Extension mismatch: URL has {url_extension} but model name has {model_extension}'
                })
            safe_name = "".join([c for c in model_name if c.isalnum() or c in ('-', '_', '.')])
        else:
            # Add the extension from URL if model name doesn't have a supported extension
            safe_name = "".join([c for c in model_name if c.isalnum() or c in ('-', '_')]) + url_extension
        
        output_path = os.path.join(BASE_MODELS_DIR, save_path, safe_name)
        
        # Ensure the directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Notify download start
        PromptServer.instance.send_sync("download-start", {})
        
        async def handle_output(line: str):
            """Process wget output line and send progress updates"""
            print(line)  # Print to console for debugging
            
            progress = parse_wget_output(line)
            if progress:
                PromptServer.instance.send_sync("download-progress", progress)
        
        # Start wget process with progress bar format
        cmd = ['wget', '--progress=bar:force', '-O', output_path, url]
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        # Read both stdout and stderr
        await asyncio.gather(
            read_stream(process.stdout, handle_output),
            read_stream(process.stderr, handle_output)
        )
        
        await process.wait()
        if process.returncode == 0:
            # Send completion message with final stats
            file_size = os.path.getsize(output_path)
            size_mb = file_size / (1024 * 1024)
            PromptServer.instance.send_sync("download-progress", {
                "percent": 100,
                "size": f"{size_mb:.1f}MB",
                "message": "✅ Download completed successfully!"
            })
            print(f"Download completed: {output_path} ({size_mb:.1f}MB)")
            return web.json_response({'success': True})
        else:
            if os.path.exists(output_path):
                os.remove(output_path)
            error_msg = "Download failed"
            PromptServer.instance.send_sync("download-error", {"error": error_msg})
            return web.json_response({'success': False, 'error': error_msg})
            
    except Exception as e:
        if 'output_path' in locals() and os.path.exists(output_path):
            os.remove(output_path)
        error_msg = str(e)
        PromptServer.instance.send_sync("download-error", {"error": error_msg})
        return web.json_response({'success': False, 'error': error_msg})

async def check_file_exists(request):
    """Check if a file with the given name already exists"""
    try:
        data = await request.json()
        model_name = data.get('model_name')
        save_path = data.get('save_path', 'loras')
        extension = data.get('extension')
        
        if not model_name or not extension:
            return web.json_response({'success': False, 'error': 'Missing model name or extension'})
            
        # Check if model_name already has a supported extension
        model_extension = os.path.splitext(model_name)[1].lower()
        if model_extension:
            if model_extension not in SUPPORTED_EXTENSIONS:
                return web.json_response({
                    'success': False, 
                    'error': f'Invalid extension: {model_extension}. Supported extensions are: {", ".join(SUPPORTED_EXTENSIONS)}'
                })
            safe_name = "".join([c for c in model_name if c.isalnum() or c in ('-', '_', '.')])
        else:
            # Validate the provided extension
            if extension not in SUPPORTED_EXTENSIONS:
                return web.json_response({
                    'success': False,
                    'error': f'Invalid extension: {extension}. Supported extensions are: {", ".join(SUPPORTED_EXTENSIONS)}'
                })
            # Add the provided extension if model name doesn't have a supported extension
            safe_name = "".join([c for c in model_name if c.isalnum() or c in ('-', '_')]) + extension
            
        file_path = os.path.join(BASE_MODELS_DIR, save_path, safe_name)
        
        exists = os.path.exists(file_path)
        return web.json_response({
            'success': True,
            'exists': exists,
            'file_path': os.path.relpath(file_path, BASE_MODELS_DIR)
        })
            
    except Exception as e:
        return web.json_response({'success': False, 'error': str(e)})

# Register routes
PromptServer.instance.routes.post("/simple-model-downloader/download")(download_model)
PromptServer.instance.routes.get("/simple-model-downloader/directories")(get_directories)
PromptServer.instance.routes.post("/simple-model-downloader/create-folder")(create_folder)
PromptServer.instance.routes.post("/simple-model-downloader/check-file")(check_file_exists)

# Required empty mappings for ComfyUI
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# This is what ComfyUI will import
WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "WEB_DIRECTORY"] 