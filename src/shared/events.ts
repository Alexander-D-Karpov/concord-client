export interface ProtoTimestamp { seconds?: number | string; nanos?: number }
export interface ProtoMessage { id: string; room_id: string; author_id: string; content: string; created_at?: ProtoTimestamp; edited_at?: ProtoTimestamp | null; deleted?: boolean; reply_to_id?: string; reply_count?: number; attachments?: any[]; mentions?: any[]; reactions?: any[]; pinned?: boolean }
export interface ProtoMember { user_id: string; room_id: string; role?: string; joined_at?: ProtoTimestamp }


export interface ProtoFriendRequest {
    id: string;
    from_user_id: string;
    to_user_id: string;
    status: string;
    created_at?: ProtoTimestamp;
    updated_at?: ProtoTimestamp;
    from_handle: string;
    from_display_name: string;
    from_avatar_url?: string;
    to_handle: string;
    to_display_name: string;
    to_avatar_url?: string;
}
export interface ServerEventPayload {
    message_created?: { message: ProtoMessage };
    message_edited?: { message: ProtoMessage };
    message_deleted?: { room_id: string; message_id: string };
    member_joined?: { member: ProtoMember };
    member_removed?: { room_id: string; user_id: string };
    voice_state_changed?: { room_id: string; user_id: string; muted: boolean; video_enabled: boolean; speaking: boolean };
    role_changed?: { room_id: string; user_id?: string; role?: string };
    ack?: { event_id: string };
    friend_request_created?: { request: ProtoFriendRequest };
    friend_request_updated?: { request: ProtoFriendRequest };
    friend_removed?: { user_id: string };
    typing_started?: { user_id: string; room_id?: string; channel_id?: string; user_display_name?: string; expires_at?: ProtoTimestamp };
    typing_stopped?: { user_id: string; room_id?: string; channel_id?: string };
    user_status_changed?: { user_id: string; status: string };
    profile_updated?: { user_id: string; display_name?: string; avatar_url?: string; status?: string; bio?: string };
}

export interface ServerEvent {
    event_id?: string;
    created_at?: ProtoTimestamp;
    payload?: ServerEventPayload;
}
