function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents || '{}');
    var action = payload.action;

    if (action === 'uploadFile') {
      return jsonResponse(uploadFileToDrive_(payload));
    }

    if (action === 'deleteFile') {
      return jsonResponse(deleteFileFromDrive_(payload));
    }

    return jsonResponse({
      success: false,
      error: 'Action non supportee.',
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.message || String(error),
    });
  }
}

function uploadFileToDrive_(payload) {
  var rootFolder = payload.rootFolderId
    ? DriveApp.getFolderById(payload.rootFolderId)
    : DriveApp.getRootFolder();
  var targetFolder = ensureFolderPath_(rootFolder, payload.folderPath || '');
  var bytes = Utilities.base64Decode(payload.contentBase64 || '');
  var blob = Utilities.newBlob(bytes, payload.mimeType || 'application/octet-stream', payload.fileName || 'file.bin');
  var file = targetFolder.createFile(blob);

  return {
    success: true,
    fileId: file.getId(),
    fileName: file.getName(),
    webViewLink: 'https://drive.google.com/file/d/' + file.getId() + '/view',
    webContentLink: 'https://drive.google.com/uc?id=' + file.getId() + '&export=download',
  };
}

function deleteFileFromDrive_(payload) {
  if (!payload.fileId) {
    throw new Error('fileId manquant.');
  }

  DriveApp.getFileById(payload.fileId).setTrashed(true);

  return {
    success: true,
    fileId: payload.fileId,
  };
}

function ensureFolderPath_(rootFolder, folderPath) {
  if (!folderPath) {
    return rootFolder;
  }

  var parts = folderPath.split('/').filter(function(part) {
    return part;
  });
  var currentFolder = rootFolder;

  for (var i = 0; i < parts.length; i++) {
    var folderName = parts[i];
    var existingFolders = currentFolder.getFoldersByName(folderName);
    currentFolder = existingFolders.hasNext()
      ? existingFolders.next()
      : currentFolder.createFolder(folderName);
  }

  return currentFolder;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
