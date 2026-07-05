import { TodoItemRow } from '../../../main/database/mapper/todo'
import { NoteRow, NoteListItem, NoteWithContent } from '../../../main/database/mapper/note'
import { WikiRow, WikiDirectoryRow } from '../../../main/database/mapper/wiki'
import { ChatTopicRow, ChatDialogueRow } from '../../../main/database/mapper/chat'
import { GraphEntity, GraphBuildJob, GraphData } from '../../../main/database/mapper/graph'
import { Lock } from '@renderer/types/settings'
import { LlmProviderInput, LlmProviderConfig } from '../../../../main/database/mapper/provider'
import { SystemSettings } from '@renderer/types/settings'

export interface PaginatedResult<T> {
  items: T[]
  hasMore: boolean
  total: number
}

export interface ToolCallDetail {
  name: string
  input: Record<string, unknown>
  output: string
}

export interface StructuredMessage {
  tool?: ToolCallDetail
  content?: string
  reasoning_content?: string
}

export interface ToolInfo {
  name: string
  label: string
  description: string
  icon: string
  color: string
}

export interface Window {
  loading: {
    onInitProgress: (
      callback: (
        event: Event,
        data: {
          progress: number
          currentTask: string
          taskIndex: number
          totalTasks: number
        }
      ) => void
    ) => void
    onInitComplete: (callback: () => void) => void
    onInitError: (callback: (event: Event, errorMessage: string) => void) => void
    notifyInitComplete: () => void
  }
  api: {
    todoItems: {
      getById: (id: number) => Promise<TodoItemRow[]>
      getByTitle: (title: string) => Promise<TodoItemRow[]>
      getByPriority: (priority: number) => Promise<TodoItemRow[]>
      getByCompletedStatus: (completed: boolean) => Promise<TodoItemRow[]>
      getAll: () => Promise<TodoItemRow[]>
      getByDueDate: (dueDate: string) => Promise<TodoItemRow[]>
      add: (
        todoItem: Omit<
          TodoItemRow,
          'id' | 'created_at' | 'updated_at' | 'completed_at' | 'started_at'
        >
      ) => Promise<number>
      update: (id: number, updates: Partial<Omit<TodoItemRow, 'id'>>) => Promise<boolean>
      delete: (id: number) => Promise<boolean>
    }
    notes: {
      getById: (id: number) => Promise<NoteWithContent | null>
      getAll: (
        page?: number,
        pageSize?: number,
        excludeWikiId?: number,
        search?: string
      ) => Promise<PaginatedResult<NoteListItem>>
      getPage: (
        query: string,
        page?: number,
        pageSize?: number
      ) => Promise<PaginatedResult<NoteListItem>>
      add: (
        note: Omit<NoteRow, 'id' | 'created_at' | 'updated_at' | 'version'> & {
          image?: string | null
          content?: string | null
        }
      ) => Promise<number>
      update: (
        id: number,
        updates: Partial<Omit<NoteRow, 'id' | 'created_at' | 'version'>> & {
          image?: string | null
          content?: string | null
        }
      ) => Promise<boolean>
      delete: (id: number) => Promise<boolean>
      deleteByTimeRange: (startTime: string, endTime: string) => Promise<number>
    }
    file: {
      selectImageFile: (allowImages?: boolean) => Promise<{
        dataUrl: string
        fileName: string
        isImage: boolean
      } | null>
      selectTextFile: () => Promise<{
        fileName: string
        filePath: string
      } | null>
      importNovel: (options: {
        filePath: string
        coverDataUrl?: string | null
      }) => Promise<{ chapterCount: number }>
      onImportNovelProgress: (
        callback: (progress: {
          processedNotes: number
          totalNotes: number
          message: string
        }) => void
      ) => () => void
    }
    wikis: {
      getById: (id: number) => Promise<WikiRow | null>
      getAll: (page?: number, pageSize?: number) => Promise<PaginatedResult<WikiRow>>
      add: (
        wiki: Omit<WikiRow, 'id' | 'note_count' | 'tags' | 'created_at' | 'updated_at'>
      ) => Promise<number>
      update: (id: number, updates: Partial<Omit<WikiRow, 'id' | 'created_at'>>) => Promise<boolean>
      delete: (id: number) => Promise<boolean>
      getDirectories: (wikiId: number) => Promise<WikiDirectoryRow[]>
      addDirectory: (
        directory: Omit<WikiDirectoryRow, 'id' | 'created_at' | 'updated_at'>
      ) => Promise<number>
      updateDirectory: (
        id: number,
        updates: Partial<Omit<WikiDirectoryRow, 'id' | 'created_at'>>
      ) => Promise<boolean>
      deleteDirectory: (id: number) => Promise<boolean>
      getNotesByDirectory: (
        directoryId: number
      ) => Promise<{ note_id: number; sort_order: number }[]>
      addNoteToDirectory: (
        directoryId: number,
        noteId: number,
        sortOrder?: number
      ) => Promise<number>
      removeNoteFromDirectory: (directoryId: number, noteId: number) => Promise<boolean>
      getDirectoriesByNote: (noteId: number) => Promise<WikiDirectoryRow[]>
    }
    setting: {
      getLockScreenCode: () => Promise<Lock>
      setLockScreenView: (open) => void
    }
    chat: {
      sendMessage: (
        message: string,
        options?: {
          tools?: string[]
          images?: string[]
          documents?: { fileName: string; filePath: string }[]
          providerId?: number
        }
      ) => Promise<StructuredMessage[]>
      onStreamChunk: (callback: (chunk: StructuredMessage) => void) => () => void
      onStreamDone: (callback: (result: { topicId: number }) => void) => () => void
      startMessageStream: (
        message: string,
        options?: {
          tools?: string[]
          images?: string[]
          documents?: { fileName: string; filePath: string }[]
          topicId?: number
          providerId?: number
        }
      ) => void
      getTools: () => Promise<ToolInfo[]>
      getAllTopics: () => Promise<ChatTopicRow[]>
      getTopicById: (id: number) => Promise<ChatTopicRow[]>
      createTopic: (title: string, model?: string, selectedTools?: string) => Promise<number>
      updateTopic: (
        id: number,
        updates: Partial<Pick<ChatTopicRow, 'title' | 'model' | 'selected_tools'>>
      ) => Promise<boolean>
      deleteTopic: (id: number) => Promise<boolean>
      getDialoguesByTopic: (topicId: number) => Promise<ChatDialogueRow[]>
      addDialogue: (dialogue: Omit<ChatDialogueRow, 'id' | 'created_at'>) => Promise<number>
      deleteDialoguesByTopic: (topicId: number) => Promise<boolean>
    }
    graph: {
      getData: (wikiId: number, typeFilter?: string, noteIds?: number[]) => Promise<GraphData>
      getEntity: (entityId: number) => Promise<GraphEntity | null>
      searchEntities: (wikiId: number, query: string) => Promise<GraphEntity[]>
      updateEntity: (id: number, updates: Record<string, unknown>) => Promise<boolean>
      deleteEntity: (id: number) => Promise<boolean>
      deleteRelation: (id: number) => Promise<boolean>
      getBuildStatus: (wikiId: number) => Promise<GraphBuildJob | null>
      appendNotes: (
        wikiId: number,
        noteIds: number[]
      ) => Promise<{
        entitiesAdded: number
        relationsAdded: number
      }>
      getProcessedNoteIds: (wikiId: number) => Promise<number[]>
      buildGraph: (wikiId: number, config?: Record<string, unknown>) => void
      onBuildProgress: (
        callback: (progress: {
          phase: string
          processedNotes: number
          totalNotes: number
          message: string
        }) => void
      ) => () => void
      onBuildComplete: (
        callback: (result: { wikiId: number; entityCount: number; relationCount: number }) => void
      ) => () => void
      onBuildError: (callback: (error: { wikiId: number; error: string }) => void) => () => void
    }
    providers: {
      getAll: () => Promise<LlmProviderConfig[]>
      getById: (id: number) => Promise<LlmProviderConfig | null>
      getDefault: () => Promise<LlmProviderConfig | null>
      getEnabled: () => Promise<LlmProviderConfig[]>
      create: (input: LlmProviderInput) => Promise<number>
      update: (id: number, updates: Partial<LlmProviderInput>) => Promise<boolean>
      delete: (id: number) => Promise<boolean>
      setDefault: (id: number) => Promise<boolean>
    }
    systemSettings: {
      getAll: () => Promise<SystemSettings>
      update: (updates: Partial<SystemSettings>) => Promise<boolean>
    }
    music: {
      selectDirectory: () => Promise<string | null>
      getFolders: () => Promise<
        {
          id: string
          path: string
          name: string
          description: string
          track_count: number
          coverDataUrl: string | null
          created_at: string
          updated_at: string
        }[]
      >
      getTracks: (folderId: string) => Promise<
        {
          id: string
          filePath: string
          title: string
          artist: string
          album: string
          duration: number
          liked: boolean
          coverDataUrl: string | null
        }[]
      >
      deleteFolder: (folderId: string) => Promise<void>
      createFolder: (
        name: string,
        description?: string
      ) => Promise<{
        id: string
        path: string
        name: string
        description: string
        track_count: number
        coverDataUrl: string | null
        created_at: string
        updated_at: string
      }>
      updateFolderDescription: (folderId: string, description: string | null) => Promise<void>
      updateFolderCover: (folderId: string) => Promise<string | null>
      saveFolderCover: (folderId: string, coverDataUrl: string | null) => Promise<void>
      selectImage: () => Promise<string | null>
      updateFolder: (
        folderId: string,
        fields: { name?: string; description?: string | null }
      ) => Promise<void>
      addTracks: (folderId: string) => Promise<
        | {
            filePath: string
            title: string
            artist: string
            album: string
            duration: number
            coverDataUrl: string | null
          }[]
        | null
      >
      updateTrack: (
        trackId: number,
        fields: { title?: string; artist?: string; album?: string }
      ) => Promise<void>
      updateTrackCover: (trackId: number) => Promise<string | null>
      readFile: (filePath: string) => Promise<ArrayBuffer>
      toggleLike: (trackId: number) => Promise<boolean>
      updateLastPlayed: (trackId: number) => Promise<void>
      getLikedTracks: () => Promise<
        {
          id: string
          filePath: string
          title: string
          artist: string
          album: string
          duration: number
          liked: boolean
          coverDataUrl: string | null
        }[]
      >
      getRecentlyPlayed: () => Promise<
        {
          id: string
          filePath: string
          title: string
          artist: string
          album: string
          duration: number
          liked: boolean
          coverDataUrl: string | null
        }[]
      >
    }
  }
}
