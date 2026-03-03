package com.hub900.entity;

import com.hub900.callback.*;
import com.hub900.a.*;

public class BleBoxingHeartRateData extends BleBroadcastData
{
    private int hubId;
    private int group;
    private long deviceId;
    private int heartRate;
    private int battery;
    private long steps;
    private float calories;
    
    public BleBoxingHeartRateData(final byte[] bytes, final byte[] data, final AckBackCallback ackCallback, final DataErrorCallback errorCallback) {
        super(bytes, data, ackCallback, errorCallback);
        try {
            this.hubId = b.e(data, 6, 2);
            this.group = b.e(data, 8, 1);
            this.deviceId = b.e(data, 9, 4);
            this.heartRate = b.e(data, 13, 1);
            this.battery = b.e(data, 14, 1);
            this.steps = b.d(data, 15, 3);
            this.calories = b.d(data, 18, 3) / 10.0f;
        }
        catch (Exception e) {
            if (errorCallback != null) {
                errorCallback.onDataError("BleBoxingHeartRateData:" + e.getMessage(), data);
            }
        }
    }
    
    @Override
    public int getHubId() {
        return this.hubId;
    }
    
    @Override
    public void setHubId(final int hubId) {
        this.hubId = hubId;
    }
    
    public int getGroup() {
        return this.group;
    }
    
    public void setGroup(final int group) {
        this.group = group;
    }
    
    public long getDeviceId() {
        return this.deviceId;
    }
    
    public void setDeviceId(final long deviceId) {
        this.deviceId = deviceId;
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
    
    public long getSteps() {
        return this.steps;
    }
    
    public void setSteps(final long steps) {
        this.steps = steps;
    }
    
    public float getCalories() {
        return this.calories;
    }
    
    public void setCalories(final float calories) {
        this.calories = calories;
    }
    
    @Override
    public String toString() {
        return "BleBoxingHeartRateData{manufacturer=" + this.getManufacturer() + ", deviceType=" + this.getDeviceType() + ", hubId=" + this.hubId + ", group=" + this.group + ", deviceId=" + this.deviceId + ", heartRate=" + this.heartRate + ", battery=" + this.battery + ", steps=" + this.steps + ", calories=" + this.calories + ", rssi=" + this.getRssi() + '}';
    }
}
