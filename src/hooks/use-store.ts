import {load} from '@tauri-apps/plugin-store'

export type Appearance = 'light' | 'dark' | 'system'

export interface EssayStore{
    saveAccessToken: (accessToken: string) => Promise<void>
    getAccessToken: () => Promise<string>
    saveAppearance: (appearance: Appearance) => Promise<void>
    getAppearance: () => Promise<Appearance>
}

export default async function useStore():Promise<EssayStore> {
    
    const store = await load('store.bin')

    const saveAccessToken = async (accessToken: string) => {
        await store.set('accessToken', accessToken)
        await store.save()
    }

    const getAccessToken = async ():Promise<string> => {
        const accessToken = await store.get('accessToken') as string
        return accessToken || ''
    }

    const saveAppearance = async (appearance: Appearance) => {
        await store.set('appearance', appearance)
        await store.save()
    }

    const getAppearance = async ():Promise<Appearance> => {
        const appearance = await store.get('appearance')
        return appearance === 'light' || appearance === 'dark'
            ? appearance
            : 'system'
    }

    return {saveAccessToken, getAccessToken, saveAppearance, getAppearance}
}
