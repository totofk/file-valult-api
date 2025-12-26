import { google, drive_v3 } from 'googleapis'
import { Readable } from 'stream'

export interface UploadOptions {
  userId: string
  originalName?: string
  metadata?: Record<string, unknown>
}

export class GoogleDriveService {
  private drive: drive_v3.Drive
  
  constructor() {
    this.drive = this.initializeAuth()
  }
  
  private initializeAuth(): drive_v3.Drive {
    // In production, we'd use a service account key file or env vars
    // For now, we assume GOOGLE_SERVICE_ACCOUNT_KEY contains the JSON string or path
    // Or we use standard GoogleAuth which picks up GOOGLE_APPLICATION_CREDENTIALS
    
    const auth = new google.auth.GoogleAuth({
      // keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 
      // or credentials from env JSON
      credentials: process.env.GOOGLE_SERVICE_ACCOUNT_KEY 
        ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY) 
        : undefined,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    })
    
    return google.drive({ version: 'v3', auth })
  }
  
  async uploadFile(file: File, options: UploadOptions) {
    // 1. Ensure user folder structure
    const userFolder = await this.ensureUserFolder(options.userId)
    
    // Convert File to Stream
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const stream = Readable.from(buffer)

    // 2. Upload with metadata
    const response = await this.drive.files.create({
      requestBody: {
        name: options.originalName || file.name,
        parents: [userFolder.id!],
        properties: {
          userId: options.userId,
          uploadedAt: new Date().toISOString(),
          fileType: file.type,
          originalName: options.originalName
        },
        appProperties: {
          filesVault: 'true',
          version: '1.0'
        }
      },
      media: {
        mimeType: file.type,
        body: stream
      }
    })
    
    return response.data
  }
  
  async ensureUserFolder(userId: string) {
    const folderName = `user_${userId}`
    
    // Check if folder exists
    const { data: folders } = await this.drive.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder'`,
      fields: 'files(id, name)'
    })
    
    if (folders.files && folders.files.length > 0) {
      return folders.files[0]
    }
    
    // Create folder if it doesn't exist
    const { data: folder } = await this.drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        properties: {
          userId,
          type: 'user_folder',
          createdAt: new Date().toISOString()
        }
      }
    })
    
    return folder
  }
}
