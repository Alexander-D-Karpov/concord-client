export {};
declare global {
    interface Window {
        concord: {
            login(handle: string, password: string): Promise<{
                access_token: string;
                refresh_token: string;
                expires_in: number;
                token_type?: string;
            }>;
            getSelf(): Promise<{
                id: string;
                handle: string;
                display_name?: string;
                avatar_url?: string;
                created_at?: { seconds: number | string; nanos?: number };
            }>;
            getRooms(): Promise<{ rooms: any[] }>;
            createRoom(name: string): Promise<any>;
            getMessages(
                roomId: string,
                limit?: number
            ): Promise<{ messages: any[]; has_more?: boolean }>;
            sendMessage(
                roomId: string,
                content: string
            ): Promise<{ message: any }>;
        };
    }
}
