package com.virtual.backend.dto;

import lombok.Data;

import java.util.List;

@Data
public class RoomMemResponse {
    private String type = "room_mems";
    private List<String> mems;
}
