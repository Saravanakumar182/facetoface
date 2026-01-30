package com.virtual.backend.websocket;

import com.virtual.backend.dto.CreateRoomResponse;
import com.virtual.backend.dto.InitRequest;
import com.virtual.backend.dto.RoomMemResponse;
import com.virtual.backend.dto.SignalMessage;
import org.jspecify.annotations.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SignalHandler extends TextWebSocketHandler {

    private final static Map<String,WebSocketSession> sessions  = new ConcurrentHashMap<>();

    private static final Map<String, Set<WebSocketSession>> rooms = new ConcurrentHashMap<>();
    private final static ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void handleTextMessage(@NonNull WebSocketSession session, @NonNull TextMessage msg) throws IOException {
        String payload = msg.getPayload();

        InitRequest signal = objectMapper.readValue(payload, InitRequest.class);

        switch (signal.getType()) {
            case "create_room" -> createRoom(session);
            case "get_room" -> getRoom(session, signal.getData());
            case "join_room" -> joinRoom(signal.getData());
            case "signal" -> sendSignal(signal.getData());
        }

    }

    private void joinRoom(String data) throws IOException {
        List<SignalMessage> signals = objectMapper.readValue(
                data,
                new TypeReference<List<SignalMessage>>() {}
        );
        for(SignalMessage signal : signals){
            sendSignal(objectMapper.writeValueAsString(signal));
        }

    }

    private void getRoom(@NonNull WebSocketSession session, String roomId) throws IOException {
        List<String> mems = new ArrayList<>();
        for(WebSocketSession ses : rooms.get(roomId)){
            mems.add(ses.getId());
        }

        RoomMemResponse resp = new RoomMemResponse();
        resp.setMems(mems);

        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(resp)));
    }

    private static void createRoom(WebSocketSession session) throws IOException {
        String roomId = UUID.randomUUID().toString();
        rooms.put(roomId,new HashSet<>());
        rooms.get(roomId).add(session);
        CreateRoomResponse resp = new CreateRoomResponse("roomId",roomId);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(resp)));
    }
    private static void  sendSignal(String payload) throws IOException {
        SignalMessage signal = objectMapper.readValue(payload,SignalMessage.class);

        WebSocketSession receiver  = sessions.get(signal.getToId());
        receiver.sendMessage(new TextMessage(payload));
    }

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) throws IOException {
        CreateRoomResponse resp = new CreateRoomResponse("id", session.getId());
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(resp)));
        sessions.put(session.getId(),session);
    }
}
