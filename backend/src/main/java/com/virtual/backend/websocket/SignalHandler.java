package com.virtual.backend.websocket;

import com.virtual.backend.dto.SignalMessage;
import org.jspecify.annotations.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SignalHandler extends TextWebSocketHandler {

    private final Map<String,WebSocketSession> sessions  = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void handleTextMessage(@NonNull WebSocketSession session, @NonNull TextMessage msg) throws IOException {
        String payload = msg.getPayload();

        SignalMessage signal = objectMapper.readValue(payload,SignalMessage.class);


        WebSocketSession receiver  = sessions.get(signal.getToId());
        receiver.sendMessage(new TextMessage(payload));

    }

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) throws IOException {
        session.sendMessage(new TextMessage("{\"type\":\"id\",\"data\":\""+session.getId()+"\"}"));
        sessions.put(session.getId(),session);
    }
}
