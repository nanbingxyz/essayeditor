export interface EssayUser {
    id: string
    avatar: string
    displayName: string
}

export type Heatmap = Record<string, number>

export interface EssayActivitySnapshot {
    user: EssayUser
    heatmap: Heatmap
}
