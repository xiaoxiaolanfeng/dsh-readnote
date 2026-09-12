/**
 * 批注库的读写。
 *
 * 批注**不进 markdown 正文**，而是旁挂在工作区的 `.readnote/annotations.json`。
 * 理由：readnote 读的常常是别人的仓库，往正文里插锚点会弄脏对方的工作区。
 * 代价是要自己维护一份「文档 → 批注」的索引，以及原子写。
 * @module dsh-readnote/host/notes
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NOTES_DIR, NOTES_FILE } from './constants.ts'

/** 文档相对路径 → 该文档的批注数组。 */
export type NoteLibrary = Record<string, unknown[]>

/**
 * 批注库的绝对路径。
 * @param workspace - 工作区根目录。
 * @returns 库文件绝对路径。
 */
export function notesPath(workspace: string): string {
  return join(workspace, NOTES_DIR, NOTES_FILE)
}

/**
 * 读整个批注库。
 * 库不存在或损坏时返回空库 —— 批注是附加数据，不该因为它读不出来就让文档打不开。
 * @param workspace - 工作区根目录。
 * @returns 文档相对路径 → 批注数组。
 */
export async function readNotes(workspace: string): Promise<NoteLibrary> {
  try {
    const raw = await readFile(notesPath(workspace), 'utf8')
    const parsed = JSON.parse(raw) as { docs?: NoteLibrary }
    return parsed?.docs ?? {}
  } catch {
    return {}
  }
}

/**
 * 写整个批注库。
 * 先写临时文件再 rename —— 避免进程中途挂掉留下半截 JSON 把整个库读废。
 * @param workspace - 工作区根目录。
 * @param docs - 文档相对路径 → 批注数组。
 */
export async function writeNotes(workspace: string, docs: NoteLibrary): Promise<void> {
  await mkdir(join(workspace, NOTES_DIR), { recursive: true })
  const target = notesPath(workspace)
  const tmp = `${target}.tmp`
  await writeFile(tmp, JSON.stringify({ version: 1, docs }, null, 2), 'utf8')
  await rename(tmp, target)
}
