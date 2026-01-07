package com.hub900.entity;

import java.util.*;

public class HubData
{
    public int length;
    public byte[] data;
    
    public HubData(final byte[] data) {
        this.data = data;
        this.length = data.length;
    }
    
    @Override
    public String toString() {
        return "HubData{length=" + this.length + ", data=" + Arrays.toString(this.data) + '}';
    }
}
