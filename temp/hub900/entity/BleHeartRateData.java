package com.hub900.entity;

import com.hub900.callback.*;
import com.hub900.a.*;

public class BleHeartRateData extends BleBroadcastData
{
    private long deviceId;
    private int heartRate;
    private int battery;
    private long steps;
    private float calories;
    private float temperature;
    private int oxygen;
    
    public BleHeartRateData(final byte[] bytes, final byte[] data, final AckBackCallback ackCallback, final DataErrorCallback errorCallback) {
        this(bytes, data, ackCallback, errorCallback, null);
    }
    
    public BleHeartRateData(final byte[] bytes, final byte[] data, final AckBackCallback ackCallback, final DataErrorCallback errorCallback, final BleSOSCallback sosCallback) {
        super(bytes, data, ackCallback, errorCallback);
        try {
            final int type = b.a(data[5]);
            if (type == 161 || type == 162) {
                this.deviceId = b.e(data, 6, 4);
                this.heartRate = b.e(data, 10, 1);
                this.battery = b.e(data, 11, 1);
                this.steps = b.d(data, 12, 3);
                this.calories = b.d(data, 15, 3) / 10.0f;
                if (type == 162) {
                    this.temperature = b.e(data, 18, 2) / 10.0f;
                    if (data.length > 21) {
                        this.oxygen = b.e(data, 20, 1);
                    }
                }
            }
            else {
                final int length = b.a(data[8]);
                final byte[] temp = b.c(data, 10, 2);
                this.manufacturer = b.l(b.n(temp));
                this.battery = b.a(data[13]);
                this.heartRate = b.a(data[15]);
                final String name = this.getBleName();
                if (name != null && name.startsWith("XW100") && length >= 8) {
                    final boolean sos = b.a(data[16]) == 1;
                    if (sosCallback != null && sos) {
                        sosCallback.onBleSOS(this);
                    }
                }
            }
        }
        catch (Exception e) {
            if (errorCallback != null) {
                errorCallback.onDataError("BleBoxingHeartRateData:" + e.getMessage(), data);
            }
        }
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
    
    public float getTemperature() {
        return this.temperature;
    }
    
    public void setTemperature(final float temperature) {
        this.temperature = temperature;
    }
    
    public int getOxygen() {
        return this.oxygen;
    }
    
    public void setOxygen(final int oxygen) {
        this.oxygen = oxygen;
    }
    
    @Override
    public String toString() {
        final String name = (this.getBleName() != null) ? ("deviceName=" + this.getBleName() + ",") : " ";
        return "BleHeartRateData{" + name + "deviceName=" + this.getBleName() + ", manufacturer=" + this.manufacturer + ", deviceType=" + this.deviceType + ", hubId=" + this.getHubId() + ", deviceId=" + this.deviceId + ", heartRate=" + this.heartRate + ", battery=" + this.battery + ", steps=" + this.steps + ", calories=" + this.calories + ", temperature=" + this.temperature + ", oxygen=" + this.oxygen + ", rssi=" + this.rssi + '}';
    }
}
