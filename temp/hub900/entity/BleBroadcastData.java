package com.hub900.entity;

import com.hub900.callback.*;
import com.hub900.a.*;

public class BleBroadcastData extends AbstractData
{
    private int bleControllerEdr;
    private int bleGeneralFind;
    private int bleHostEdr;
    private int bleLen;
    private int bleLimitFind;
    private String bleMac;
    private String bleName;
    private int bleUnSupportEdr;
    protected String manufacturer;
    protected int deviceType;
    protected int rssi;
    private int advLen;
    protected String userCustom;
    protected String uuid;
    
    public BleBroadcastData(final byte[] bytes, final byte[] data, final AckBackCallback ackCallback, final DataErrorCallback errorCallback) {
        super(bytes, data, ackCallback, errorCallback);
        try {
            byte[] realData = new byte[0];
            this.bleLen = (data[0] & 0xFF);
            this.advLen = (data[1] & 0xFF);
            final byte[] company = b.c(data, 3, 2);
            this.manufacturer = b.l(b.n(company));
            this.deviceType = b.a(data[3]);
            final byte[] bleAdvBytes = new byte[this.bleLen - 7];
            System.arraycopy(data, 1, bleAdvBytes, 0, this.bleLen - 7);
            this.rssi = data[bleAdvBytes.length + 1];
            final byte[] macBytes = new byte[6];
            System.arraycopy(data, bleAdvBytes.length + 2, macBytes, 0, 6);
            this.bleMac = d.z(macBytes);
            if (bleAdvBytes.length > 0) {
                int index = 0;
                for (int i2 = 0; i2 < bleAdvBytes.length; i2 = index + 1) {
                    final int bleAdvLen = bleAdvBytes[i2] & 0xFF;
                    final int i3 = i2 + 1;
                    if (bleAdvLen == 0 || bleAdvBytes.length <= bleAdvLen) {
                        return;
                    }
                    final int bleAdvType = bleAdvBytes[i3] & 0xFF;
                    final byte[] temp = new byte[bleAdvLen - 1];
                    System.arraycopy(bleAdvBytes, i3 + 1, temp, 0, temp.length);
                    switch (bleAdvType) {
                        case 1: {
                            this.bleLimitFind = (a.a(0, temp[0]) ? 1 : 0);
                            this.bleGeneralFind = (a.a(1, temp[0]) ? 1 : 0);
                            this.bleUnSupportEdr = (a.a(2, temp[0]) ? 1 : 0);
                            this.bleControllerEdr = (a.a(3, temp[0]) ? 1 : 0);
                            this.bleHostEdr = (a.a(4, temp[0]) ? 1 : 0);
                            index = i3 + temp.length;
                            break;
                        }
                        case 2:
                        case 3: {
                            int count = 0;
                            final StringBuffer str = new StringBuffer();
                            for (int j = 0; j < temp.length; ++j) {
                                if (++count == 2) {
                                    str.append(a.e(new byte[] { temp[j], temp[j - 1] })).append("\uff0c");
                                    count = 0;
                                }
                            }
                            this.uuid = str.deleteCharAt(str.length() - 1).toString();
                            index = i3 + temp.length;
                            break;
                        }
                        case 4:
                        case 5: {
                            int count2 = 0;
                            final StringBuffer str2 = new StringBuffer();
                            for (int j2 = 0; j2 < temp.length; ++j2) {
                                if (++count2 == 4) {
                                    str2.append(a.e(new byte[] { temp[j2], temp[j2 - 1], temp[j2 - 2], temp[j2 - 3] })).append(",");
                                    count2 = 0;
                                }
                            }
                            this.uuid = str2.deleteCharAt(str2.length() - 1).toString();
                            index = i3 + temp.length;
                            break;
                        }
                        case 6:
                        case 7: {
                            int count3 = 0;
                            final StringBuffer str3 = new StringBuffer();
                            for (int j3 = 0; j3 < temp.length; ++j3) {
                                if (++count3 == 16) {
                                    str3.append(a.e(new byte[] { temp[j3], temp[j3 - 1], temp[j3 - 2], temp[j3 - 3], temp[j3 - 4], temp[j3 - 5], temp[j3 - 6], temp[j3 - 7], temp[j3 - 8], temp[j3 - 9], temp[j3 - 10], temp[j3 - 11], temp[j3 - 12], temp[j3 - 13], temp[j3 - 14], temp[j3 - 15] })).append(",");
                                    count3 = 0;
                                }
                            }
                            this.uuid = str3.deleteCharAt(str3.length() - 1).toString();
                            index = i3 + temp.length;
                            break;
                        }
                        case 8:
                        case 9: {
                            this.bleName = a.f(temp);
                            index = i3 + temp.length;
                            break;
                        }
                        case 255: {
                            if (temp.length > 0) {
                                realData = temp;
                            }
                            index = i3 + temp.length;
                            break;
                        }
                        default: {
                            index = i3 + temp.length;
                            break;
                        }
                    }
                }
            }
            if (realData.length > 0) {
                if (this.bleName == null || !this.bleName.contains("JR20")) {
                    final int mRSPType = realData[2] & 0xFF;
                    switch (mRSPType) {
                        case 161:
                        case 162: {}
                        case 164: {}
                    }
                }
            }
        }
        catch (Exception e) {
            if (errorCallback != null) {
                errorCallback.onDataError("BleBroadcastData:" + e.getMessage(), data);
            }
        }
    }
    
    public int getRssi() {
        return this.rssi;
    }
    
    public void setRssi(final int rssi2) {
        this.rssi = rssi2;
    }
    
    public String getBleMac() {
        return this.bleMac;
    }
    
    public void setBleMac(final String bleMac2) {
        this.bleMac = bleMac2;
    }
    
    public int getBleLen() {
        return this.bleLen;
    }
    
    public void setBleLen(final int bleLen2) {
        this.bleLen = bleLen2;
    }
    
    public String getBleName() {
        return this.bleName;
    }
    
    public void setBleName(final String bleName2) {
        this.bleName = bleName2;
    }
    
    public int getBleLimitFind() {
        return this.bleLimitFind;
    }
    
    public void setBleLimitFind(final int bleLimitFind2) {
        this.bleLimitFind = bleLimitFind2;
    }
    
    public int getBleGeneralFind() {
        return this.bleGeneralFind;
    }
    
    public void setBleGeneralFind(final int bleGeneralFind2) {
        this.bleGeneralFind = bleGeneralFind2;
    }
    
    public int getBleUnSupportEdr() {
        return this.bleUnSupportEdr;
    }
    
    public void setBleUnSupportEdr(final int bleUnSupportEdr2) {
        this.bleUnSupportEdr = bleUnSupportEdr2;
    }
    
    public int getBleControllerEdr() {
        return this.bleControllerEdr;
    }
    
    public void setBleControllerEdr(final int bleControllerEdr2) {
        this.bleControllerEdr = bleControllerEdr2;
    }
    
    public int getBleHostEdr() {
        return this.bleHostEdr;
    }
    
    public void setBleHostEdr(final int bleHostEdr2) {
        this.bleHostEdr = bleHostEdr2;
    }
    
    public String getUuid() {
        return this.uuid;
    }
    
    public void setUuid(final String uuid2) {
        this.uuid = uuid2;
    }
    
    public String getUserCustom() {
        return this.userCustom;
    }
    
    public void setUserCustom(final String userCustom2) {
        this.userCustom = userCustom2;
    }
    
    public String getManufacturer() {
        return this.manufacturer;
    }
    
    public void setManufacturer(final String manufacturer) {
        this.manufacturer = manufacturer;
    }
    
    public int getDeviceType() {
        return this.deviceType;
    }
    
    public void setDeviceType(final int deviceType) {
        this.deviceType = deviceType;
    }
    
    public String getBleString() {
        return "{bleControllerEdr=" + this.bleControllerEdr + ", bleGeneralFind=" + this.bleGeneralFind + ", bleHostEdr=" + this.bleHostEdr + ", bleLen=" + this.bleLen + ", bleLimitFind=" + this.bleLimitFind + ", bleMac=" + this.bleMac + ", bleName=" + this.bleName + ", bleUnSupportEdr=" + this.bleUnSupportEdr + ", manufacturer=" + this.manufacturer + ", deviceType=" + this.deviceType + ", advLen=" + this.advLen + ", userCustom=" + this.userCustom + ", uuid=" + this.uuid + ", rssi=" + this.rssi + '}';
    }
}
