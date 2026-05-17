import { WikiDirectoryRow } from '../../../../../main/database/mapper/wiki'

export interface DirectoryWithChildren extends WikiDirectoryRow {
  children?: DirectoryWithChildren[]
}
