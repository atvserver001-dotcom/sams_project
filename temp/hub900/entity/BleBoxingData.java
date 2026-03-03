package com.hub900.entity;

import com.hub900.callback.*;
import com.hub900.a.*;

public class BleBoxingData extends BleBroadcastData
{
    private int hubId;
    private int group;
    private long deviceId;
    private int hand;
    private int power;
    private int speed;
    private int time;
    private int battery;
    private int straight;
    private int straightPower;
    private int straightSpeed;
    private int swing;
    private int swingSpeed;
    private int swingPower;
    private int upperCut;
    private int upperCutPower;
    private int upperCutSpeed;
    
    public BleBoxingData(final byte[] bytes, final byte[] data, final AckBackCallback ackCallback, final DataErrorCallback errorCallback) {
        super(bytes, data, ackCallback, errorCallback);
        try {
            this.hubId = b.e(data, 6, 2);
            this.group = b.e(data, 8, 1);
            this.deviceId = b.e(data, 9, 4);
            this.hand = b.e(data, 13, 1);
            final int trains = b.e(data, 14, 2);
            this.power = (trains >> 7 & 0x1FF);
            this.speed = (trains & 0x7F);
            this.time = b.e(data, 16, 2);
            this.battery = b.e(data, 18, 1);
            this.straight = b.e(data, 19, 2);
            final int straights = b.e(data, 21, 2);
            this.straightPower = (straights >> 7 & 0x1FF);
            this.straightSpeed = (straights & 0x7F);
            this.swing = b.e(data, 23, 2);
            final int swings = b.e(data, 25, 2);
            this.swingPower = (swings >> 7 & 0x1FF);
            this.swingSpeed = (swings & 0x7F);
            this.upperCut = b.e(data, 27, 2);
            final int upperCuts = b.e(data, 29, 2);
            this.upperCutPower = (upperCuts >> 7 & 0x1FF);
            this.upperCutSpeed = (upperCuts & 0x7F);
        }
        catch (Exception e) {
            if (errorCallback != null) {
                errorCallback.onDataError("BleBoxingData:" + e.getMessage(), data);
            }
        }
    }
    
    public Hand getHand() {
        return ((this.hand & 0x1) == 0x1) ? Hand.RIGHT : Hand.LEFT;
    }
    
    public Fist getFist() {
        final int value = this.hand >> 1;
        return (value == 2) ? Fist.UPPERCUT : ((value == 1) ? Fist.SWING : Fist.STRAIGHT);
    }
    
    @Override
    public int getHubId() {
        return this.hubId;
    }
    
    public int getGroup() {
        return this.group;
    }
    
    public long getDeviceId() {
        return this.deviceId;
    }
    
    public int getPower() {
        return this.power;
    }
    
    public int getSpeed() {
        return this.speed;
    }
    
    public int getTime() {
        return this.time;
    }
    
    public int getBattery() {
        return this.battery;
    }
    
    public int getStraight() {
        return this.straight;
    }
    
    public int getStraightPower() {
        return this.straightPower;
    }
    
    public int getStraightSpeed() {
        return this.straightSpeed;
    }
    
    public int getSwing() {
        return this.swing;
    }
    
    public int getSwingSpeed() {
        return this.swingSpeed;
    }
    
    public int getSwingPower() {
        return this.swingPower;
    }
    
    public int getUpperCut() {
        return this.upperCut;
    }
    
    public int getUpperCutPower() {
        return this.upperCutPower;
    }
    
    public int getUpperCutSpeed() {
        return this.upperCutSpeed;
    }
    
    @Override
    public String toString() {
        return "BleBoxingData{manufacturer=" + this.getManufacturer() + ", deviceType=" + this.getDeviceType() + ", hubId=" + this.hubId + ", group=" + this.group + ", deviceId=" + this.deviceId + ", hand=" + this.getHand() + ", fist=" + this.getFist() + ", power=" + this.power + ", speed=" + this.speed + ", time=" + this.time + ", battery=" + this.battery + ", straight=" + this.straight + ", straightPower=" + this.straightPower + ", straightSpeed=" + this.straightSpeed + ", swing=" + this.swing + ", swingPower=" + this.swingPower + ", swingSpeed=" + this.swingSpeed + ", upperCut=" + this.upperCut + ", upperCutPower=" + this.upperCutPower + ", upperCutSpeed=" + this.upperCutSpeed + ", rssi=" + this.getRssi() + '}';
    }
    
    public enum Fist
    {
        STRAIGHT, 
        SWING, 
        UPPERCUT;
    }
    
    public enum Hand
    {
        LEFT, 
        RIGHT;
    }
}
