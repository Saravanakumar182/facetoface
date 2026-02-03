package com.virtual.backend.websocket;

import com.virtual.backend.dto.Response;
import com.virtual.backend.dto.InitRequest;
import com.virtual.backend.dto.RoomMemResponse;
import com.virtual.backend.dto.SignalMessage;
import org.jspecify.annotations.NonNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
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

    private static final Logger log = LoggerFactory.getLogger(SignalHandler.class);

    @Override
    public void handleTextMessage(@NonNull WebSocketSession session, @NonNull TextMessage msg) throws IOException {
        String payload = msg.getPayload();

        InitRequest signal = objectMapper.readValue(payload, InitRequest.class);

        switch (signal.getType()) {
            case "create_room" -> createRoom(session);
            case "get_room" -> getRoom(session, signal.getData());
            case "join_room" -> joinRoom(signal.getData());
            case "leave_room" -> leaveRoom(session,signal.getData());
            case "signal" -> sendSignal(signal.getData());
        }
    }

    private void leaveRoom(WebSocketSession session,String roomId) throws IOException {

        if (rooms.containsKey(roomId)) {
            rooms.get(roomId).remove(session.getId());
        }
        log.info ("{} has left the room {}",session.getId(),roomId);

        for(WebSocketSession ses : rooms.get(roomId)){
            Response resp  = new Response("mem_leave", ses.getId());
            safeSend(ses,objectMapper.writeValueAsString(resp));
        }
    }

    private void joinRoom(String data) throws IOException {
        List<SignalMessage> signals = objectMapper.readValue(
                data,
                new TypeReference<List<SignalMessage>>() {}
        );
        for(SignalMessage signal : signals)
            safeSend(sessions.get(signal.getToId()),objectMapper.writeValueAsString(signal));

    }

    private void getRoom(@NonNull WebSocketSession session, String roomId) throws IOException {
        List<String> mems = new ArrayList<>();
        if(rooms.containsKey(roomId)) {
            for (WebSocketSession ses : rooms.get(roomId)) mems.add(ses.getId());
            RoomMemResponse resp = new RoomMemResponse();
            resp.setMems(mems);
            safeSend(session,objectMapper.writeValueAsString(resp));
            rooms.get(roomId).add(session);
            log.info("{} has requested mem details of {} and joined", session.getId(), roomId);
        }else{
            log.info("there is no room named {}",roomId);
        }
    }

    private static void createRoom(WebSocketSession session) throws IOException {
        String roomId = UUID.randomUUID().toString();
        rooms.put(roomId,new HashSet<>());
        log.info("room created for {} {}", session.getId(), roomId);
        Response resp = new Response("roomId",roomId);
        safeSend(session,objectMapper.writeValueAsString(resp));
    }

    private static void sendSignal(String payload) throws IOException {
        SignalMessage signal = objectMapper.readValue(payload,SignalMessage.class);

        WebSocketSession receiver  = sessions.get(signal.getToId());

        log.info("{}",payload);

        Response resp = new Response("signal", payload);
        log.info(objectMapper.writeValueAsString(resp));
        safeSend(receiver,objectMapper.writeValueAsString(resp));
    }

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) throws IOException {
        Response resp = new Response("id", session.getId());
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(resp)));
        sessions.put(session.getId(),session);
        log.info("{} has connected",session.getId());
    }

    @Override
    public void afterConnectionClosed(@NonNull WebSocketSession session, @NonNull CloseStatus status) throws IOException {
        sessions.remove(session.getId());
        log.info("{} has disconnected",session.getId());
    }

    private static void safeSend(WebSocketSession session, String payload) throws IOException {
        synchronized (session) {
            if (session.isOpen()) {
                try {
                    session.sendMessage(new TextMessage(payload));
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        }
    }
}
