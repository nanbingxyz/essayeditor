export interface EssayUser {
    avatar: string
    displayName: string
}

export type Heatmap = Record<string, number>

export interface EssayActivitySnapshot {
    user: EssayUser
    heatmap: Heatmap
}
