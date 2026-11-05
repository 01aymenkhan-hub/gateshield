"""Ground truth for supplied samples; never used by application inference."""
SMART = {"fullName":"Muhammad Mehmood Asim", "fatherHusbandName":"Muhammad Asim Khan",
         "cnicNumber":"42201-4319234-7", "gender":"Male", "dateOfBirth":"2003-07-24",
         "dateOfIssue":"2021-09-02", "dateOfExpiry":"2031-09-02", "cnicIdentification":""}
OLD = {"fullName":"", "fatherHusbandName":"",
       "cnicNumber":"42201-2050433-1", "gender":"Male", "dateOfBirth":"1998-11-12",
       "dateOfIssue":"", "dateOfExpiry":"", "cnicIdentification":""}
SYNTHETIC = {"fullName":"MUHAMMAD ASIM", "fatherHusbandName":"MUHAMMAD IQBAL",
             "cnicNumber":"42101-1234567-1", "gender":"Male", "dateOfBirth":"2002-01-01",
             "dateOfIssue":"2020-05-10", "dateOfExpiry":"2030-05-10", "cnicIdentification":""}
NEWER_DLS = {"licenseNumber":"42201-2050433-1#259", "fullName":"AMMAR AHMED SIDDIQUE",
             "fatherHusbandName":"ZAFAR AHMED", "dateOfBirth":"12-Nov-1998",
             "category":"M CYCLE, M CAR", "issueDate":"10-Oct-2025", "validUpto":"09-Oct-2030",
             "licensingAuthority":"DSP MUNIR AHMED AWAN, DL Saudabad Karachi"}
OLDER_DLS = {"licenseNumber":"42201-8316522-3#160", "fullName":"MUHAMMAD ARSALAN",
             "fatherHusbandName":"MUHAMMAD ASLAM SHARIF", "dateOfBirth":"25-Jun-1986",
             "category":"M CYCLE, M CAR", "issueDate":"29-May-2013", "validUpto":"27-May-2028",
             "licensingAuthority":"DSP M. Ayoob Bhurgari, DL Clifton, Karachi"}
FIXTURES = [
    ("samples/smart_cnic.jpg", "cnic", SMART),
    ("samples/cnic_front.jpg", "cnic", SMART),
    ("test_cnic.png", "cnic", SYNTHETIC),
    ("samples/dls_newer.jpg", "dls", NEWER_DLS),
    ("samples/dls_older.jpg", "dls", OLDER_DLS),
    ("samples/old-cnic-pic.jpg", "cnic", OLD),
]
