package com.hub900.entity;

import com.hub900.callback.*;
import com.hub900.a.*;

public class HeartBeatData extends AbstractData
{
    private String hardwareInfo;
    private int hardwareLen;
    private int hubConnectMode;
    private int hubDataSource;
    private int hubOnOrOff;
    private int Battery;
    private String hubRemarks;
    private int hubRemarksLen;
    private String f1ip;
    private int ipLen;
    private String limitBleName;
    private int limitBleNameLen;
    private String limitUUID;
    private int limitUUIDLen;
    private int networkSign;
    private String port;
    private int portLen;
    private int rssi;
    private double sendFrequency;
    private String softwareInfo;
    private int softwareLen;
    
    public HeartBeatData(final byte[] bytes, final byte[] data, final AckBackCallback ackCallback, final DataErrorCallback errorCallback) {
        super(bytes, data, ackCallback, errorCallback);
        try {
            final int totalLen = data.length;
            this.Battery = (data[0] & 0xFF);
            this.sendFrequency = this.returnSendFrequency(data[1] & 0xFF);
            this.hubDataSource = (data[2] & 0xFF);
            this.hubRemarksLen = (data[3] & 0xFF);
            this.limitBleNameLen = (data[4] & 0xFF);
            this.limitUUIDLen = (data[5] & 0xFF);
            this.rssi = data[6];
            this.networkSign = (data[7] & 0xFF);
            this.ipLen = (data[8] & 0xFF);
            this.portLen = (data[9] & 0xFF);
            final byte[] bytes2 = { 0 };
            System.arraycopy(data, 9, bytes2, 0, this.hardwareLen);
            this.hardwareInfo = a.f(bytes2);
        }
        catch (Exception e) {
            if (errorCallback != null) {
                errorCallback.onDataError("HeartBeatData:" + e.getMessage(), data);
            }
        }
    }
    
    private double returnSendFrequency(final int type) {
        switch (type) {
            case 1: {
                return 0.5;
            }
            case 2: {
                return 1.0;
            }
            case 3: {
                return 1.5;
            }
            case 4: {
                return 2.0;
            }
            case 5: {
                return 2.5;
            }
            case 6: {
                return 3.0;
            }
            case 7: {
                return 3.5;
            }
            case 8: {
                return 4.0;
            }
            case 9: {
                return 4.5;
            }
            case 10: {
                return 5.0;
            }
            default: {
                return 0.5;
            }
        }
    }
    
    public int getHubDataSource() {
        return this.hubDataSource;
    }
    
    public void setHubDataSource(final int hubDataSource2) {
        this.hubDataSource = hubDataSource2;
    }
    
    public int getBattery() {
        return this.Battery;
    }
    
    public void setBattery(final int Battery) {
        this.Battery = Battery;
    }
    
    public int getHubRemarksLen() {
        return this.hubRemarksLen;
    }
    
    public void setHubRemarksLen(final int hubRemarksLen2) {
        this.hubRemarksLen = hubRemarksLen2;
    }
    
    public String getHubRemarks() {
        return this.hubRemarks;
    }
    
    public void setHubRemarks(final String hubRemarks2) {
        this.hubRemarks = hubRemarks2;
    }
    
    public double getSendFrequency() {
        return this.sendFrequency;
    }
    
    public void setSendFrequency(final double sendFrequency2) {
        this.sendFrequency = sendFrequency2;
    }
    
    public int getLimitBleNameLen() {
        return this.limitBleNameLen;
    }
    
    public void setLimitBleNameLen(final int limitBleNameLen2) {
        this.limitBleNameLen = limitBleNameLen2;
    }
    
    public String getLimitBleName() {
        return this.limitBleName;
    }
    
    public void setLimitBleName(final String limitBleName2) {
        this.limitBleName = limitBleName2;
    }
    
    public int getLimitUUIDLen() {
        return this.limitUUIDLen;
    }
    
    public void setLimitUUIDLen(final int limitUUIDLen2) {
        this.limitUUIDLen = limitUUIDLen2;
    }
    
    public String getLimitUUID() {
        return this.limitUUID;
    }
    
    public void setLimitUUID(final String limitUUID2) {
        this.limitUUID = limitUUID2;
    }
    
    public int getRssi() {
        return this.rssi;
    }
    
    public void setRssi(final int rssi2) {
        this.rssi = rssi2;
    }
    
    public int getNetworkSign() {
        return this.networkSign;
    }
    
    public void setNetworkSign(final int networkSign2) {
        this.networkSign = networkSign2;
    }
    
    public int getIpLen() {
        return this.ipLen;
    }
    
    public void setIpLen(final int ipLen2) {
        this.ipLen = ipLen2;
    }
    
    public String getIp() {
        return this.f1ip;
    }
    
    public void setIp(final String ip) {
        this.f1ip = ip;
    }
    
    public int getPortLen() {
        return this.portLen;
    }
    
    public void setPortLen(final int portLen2) {
        this.portLen = portLen2;
    }
    
    public String getPort() {
        return this.port;
    }
    
    public void setPort(final String port2) {
        this.port = port2;
    }
    
    public int getSoftwareLen() {
        return this.softwareLen;
    }
    
    public void setSoftwareLen(final int softwareLen2) {
        this.softwareLen = softwareLen2;
    }
    
    public String getSoftwareInfo() {
        return this.softwareInfo;
    }
    
    public void setSoftwareInfo(final String softwareInfo2) {
        this.softwareInfo = softwareInfo2;
    }
    
    public int getHardwareLen() {
        return this.hardwareLen;
    }
    
    public void setHardwareLen(final int hardwareLen2) {
        this.hardwareLen = hardwareLen2;
    }
    
    public String getHardwareInfo() {
        return this.hardwareInfo;
    }
    
    public void setHardwareInfo(final String hardwareInfo2) {
        this.hardwareInfo = hardwareInfo2;
    }
    
    public int getHubConnectMode() {
        return this.hubConnectMode;
    }
    
    public void setHubConnectMode(final int hubConnectMode2) {
        this.hubConnectMode = hubConnectMode2;
    }
    
    public int getHubOnOrOff() {
        return this.hubOnOrOff;
    }
    
    public void setHubOnOrOff(final int hubOnOrOff2) {
        this.hubOnOrOff = hubOnOrOff2;
    }
    
    @Override
    public String toString() {
        return "HeartBeatData [hubId =" + this.getHubId() + ", hubMac =" + this.getHubMac() + ", hubRemarks =" + this.getHubRemarks() + ", Battery =" + this.getBattery() + ", sendFrequency=" + this.getSendFrequency() + ", limitBleName=" + this.getLimitBleName() + ", limitUUID=" + this.getLimitUUID() + ", rssi=" + this.getRssi() + ", networkSign=" + this.getNetworkSign() + ", ip=" + this.getIp() + ", port=" + this.getPort() + ", hubConnectMode=" + this.getHubConnectMode() + ", hubOnOrOff=" + this.getHubOnOrOff() + "]";
    }
}
