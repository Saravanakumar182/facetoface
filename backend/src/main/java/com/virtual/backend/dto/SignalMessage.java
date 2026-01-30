package com.virtual.backend.dto;

import lombok.Data;

@Data
public class SignalMessage {

    private String fromId;
    private String toId;
    private String type;
    private Object data;

}
