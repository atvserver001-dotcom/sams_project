package com.hub900.entity;

import com.hub900.callback.*;
import com.hub900.a.*;

public class BleCadenceDta extends BleBroadcastData
{
    private long wheel;
    private int time;
    
    public BleCadenceDta(final byte[] bytes, final byte[] data, final AckBackCallback ackCallback, final DataErrorCallback errorCallback) {
        super(bytes, data, ackCallback, errorCallback);
        try {
            final byte[] bytes2 = b.c(data, 12, 3);
            final byte[] bytes3 = b.c(data, 15, 2);
            this.wheel = b.e(b.n(bytes2), 0, 3);
            this.time = b.e(b.n(bytes3), 0, 2);
        }
        catch (Exception e) {
            if (errorCallback != null) {
                errorCallback.onDataError("BleCadenceDta:" + e.getMessage(), data);
            }
        }
    }
    
    public long getWheel() {
        return this.wheel;
    }
    
    public void setWheel(final long wheel) {
        this.wheel = wheel;
    }
    
    public int getTime() {
        return this.time;
    }
    
    public void setTime(final int time) {
        this.time = time;
    }
    
    @Override
    public String toString() {
        return "BleCadenceDta{ bleName=" + this.getBleName() + ", bleMac=" + this.getBleMac() + ", uuid=" + this.uuid + ", wheel=" + this.wheel + ", time=" + this.time + ", rssi=" + this.rssi + '}';
    }
}
