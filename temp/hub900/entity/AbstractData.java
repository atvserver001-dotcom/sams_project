package com.hub900.entity;

import com.hub900.callback.*;
import com.hub900.a.*;

public abstract class AbstractData
{
    private int magicData;
    private int hubId;
    private int packetSerialNumber;
    private int version;
    private int packetLen;
    private int ack;
    private String hubMac;
    private int cmd;
    private String usbVersion;
    
    public AbstractData(final byte[] bytes, final byte[] data, final AckBackCallback ackCallback, final DataErrorCallback errorCallback) {
        try {
            this.magicData = (bytes[0] & 0xFF);
            this.hubId = a.b(bytes[1], bytes[2], bytes[3], bytes[4]);
            this.packetSerialNumber = a.b(bytes[5], bytes[6]);
            this.version = (bytes[7] & 0xFF);
            this.packetLen = a.b(bytes[8], bytes[9]);
            final byte[] usbVersionByte = new byte[3];
            System.arraycopy(bytes, 10, usbVersionByte, 0, 3);
            final StringBuffer builder = new StringBuffer(d.C(usbVersionByte));
            builder.insert(2, ".");
            builder.insert(5, ".");
            this.usbVersion = builder.toString();
            this.cmd = (bytes[19] & 0xFF);
            final byte[] macBytes = new byte[6];
            System.arraycopy(bytes, 13, macBytes, 0, 6);
            final byte[] bb = new byte[macBytes.length];
            for (int j = 0; j < macBytes.length; ++j) {
                bb[j] = macBytes[macBytes.length - j - 1];
            }
            this.hubMac = d.z(bb);
            if (this.cmd == 4) {
                final String msg = "7EAA";
                final byte[] hubIdByte = new byte[4];
                System.arraycopy(bytes, 1, hubIdByte, 0, 4);
                final String hubId = b.e(d.v(hubIdByte));
                final String header = "000035001B000000";
                final String macStr = b.e(this.hubMac.replaceAll(":", ""));
                final String appData = "640100020000";
                final String sum = "AA" + hubId + header + macStr + appData;
                final byte[] result = d.a(sum);
                final int sum2 = d.B(result);
                final long ifCheck = d.a(sum2);
                final String check = msg + hubId + header + macStr + appData + d.v(d.a(ifCheck)) + "7F";
                final byte[] callbackMessage = d.a(check);
                if (ackCallback != null) {
                    ackCallback.onAckBack(callbackMessage);
                }
            }
        }
        catch (Exception e) {
            if (errorCallback != null) {
                errorCallback.onDataError("AbstractData:" + e.getMessage(), bytes);
            }
        }
    }
    
    public int getPacketLen() {
        return this.packetLen;
    }
    
    public void setPacketLen(final int packetLen2) {
        this.packetLen = packetLen2;
    }
    
    public int getHubId() {
        return this.hubId;
    }
    
    public void setHubId(final int hubId2) {
        this.hubId = hubId2;
    }
    
    public int getMagicData() {
        return this.magicData;
    }
    
    public void setMagicData(final int magicData2) {
        this.magicData = magicData2;
    }
    
    public int getPacketSerialNumber() {
        return this.packetSerialNumber;
    }
    
    public void setPacketSerialNumber(final int packetSerialNumber2) {
        this.packetSerialNumber = packetSerialNumber2;
    }
    
    public int getVersion() {
        return this.version;
    }
    
    public void setVersion(final int version2) {
        this.version = version2;
    }
    
    public int getAck() {
        return this.ack;
    }
    
    public void setAck(final int ack2) {
        this.ack = ack2;
    }
    
    public String getHubMac() {
        return this.hubMac;
    }
    
    public void setHubMac(final String hubMac2) {
        this.hubMac = hubMac2;
    }
    
    public int getCmd() {
        return this.cmd;
    }
    
    public void setCmd(final int cmd) {
        this.cmd = cmd;
    }
    
    public String getUsbVersion() {
        return this.usbVersion;
    }
    
    public void setUsbVersion(final String usbVersion) {
        this.usbVersion = usbVersion;
    }
    
    public String getPackageString() {
        return "{magicData=" + this.magicData + ", hubId=" + this.hubId + ", packetSerialNumber=" + this.packetSerialNumber + ", version=" + this.version + ", packetLen=" + this.packetLen + ", ack=" + this.ack + ", hubMac=" + this.hubMac + ", cmd=" + this.cmd + ", usbVersion=" + this.usbVersion + '}';
    }
}
