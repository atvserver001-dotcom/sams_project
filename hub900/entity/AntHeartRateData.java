package com.hub900.entity;

import com.hub900.callback.*;
import com.hub900.a.*;

public class AntHeartRateData extends AbstractData
{
    private long deviceId;
    private int deviceType;
    private int heartRate;
    private int battery;
    private int rssi;
    
    public AntHeartRateData(final byte[] bytes, final byte[] data, final AckBackCallback ackCallback, final DataErrorCallback errorCallback) {
        super(bytes, data, ackCallback, errorCallback);
        try {
            this.deviceType = (data[0] & 0xFF);
            final byte[] deviceID = new byte[4];
            final long devi = d.f(data, 0, 2);
            System.arraycopy(data, 2, deviceID, 0, 4);
            final long deviceIDIF = d.f(data, 1, 1) >> 4;
            if (devi == 0L || devi == 43981L) {
                if (deviceIDIF != 0L) {
                    final byte[] deviceIDByte = { d.n(d.b(deviceIDIF)), 0, 0 };
                    System.arraycopy(deviceID, 2, deviceIDByte, 1, 2);
                    this.deviceId = d.f(deviceIDByte, 0, 3);
                }
            }
            else {
                this.deviceId = d.b(deviceID);
            }
            switch (data[6] & 0xFF) {
                case 7: {
                    this.battery = (data[7] & 0xFF);
                    break;
                }
            }
            this.heartRate = (data[13] & 0xFF);
            this.rssi = (data[data.length - 1] & 0xFF) - 256;
        }
        catch (Exception e) {
            if (errorCallback != null) {
                errorCallback.onDataError("AntHeartRateData:" + e.getMessage(), data);
            }
        }
    }
    
    public long getDeviceId() {
        return this.deviceId;
    }
    
    public void setDeviceId(final long deviceId2) {
        this.deviceId = deviceId2;
    }
    
    public int getDeviceType() {
        return this.deviceType;
    }
    
    public void setDeviceType(final int deviceType) {
        this.deviceType = deviceType;
    }
    
    public int getHeartRate() {
        return this.heartRate;
    }
    
    public void setHeartRate(final int heartRate) {
        this.heartRate = heartRate;
    }
    
    public int getBattery() {
        return this.battery;
    }
    
    public void setBattery(final int battery) {
        this.battery = battery;
    }
    
    public int getRssi() {
        return this.rssi;
    }
    
    public void setRssi(final int rssi2) {
        this.rssi = rssi2;
    }
    
    @Override
    public String toString() {
        return "AntHeartRateData{deviceId=" + this.deviceId + ", deviceType=" + this.deviceType + ", heartRate=" + this.heartRate + ", Battery=" + this.battery + ", rssi=" + this.rssi + '}';
    }
}
