import {createStore} from '@tauri-apps/plugin-store'


export interface EssayStore{
    saveAccessToken: (accessToken: string) => Promise<void>
    getAccessToken: () => Promise<string>
}

export default async function useStore():Promise<EssayStore> {
    
    const store = await createStore('store.bin')

    const saveAccessToken = async (accessToken: string) => {
        await store.set('accessToken', accessToken)
        await store.save()
    }

    const getAccessToken = async ():Promise<string> => {
        const accessToken = await store.get('accessToken') as string
        return accessToken || ''
    }

    return {saveAccessToken, getAccessToken}
}
