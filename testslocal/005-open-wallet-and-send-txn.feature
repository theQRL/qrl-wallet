Feature: Open Wallet and Send Txn
    As a visitor to the site,
    I should be able to open an existing wallet
    And send a transaction from it

Background:
    Given I am on the wallet site

@watch
Scenario: Visitor opens a wallet and sends a transaction
    When I click Open Wallet
    And enter my mnemonic phrase "absorb filled syrup axle occupy club fairly break liquid major patrol forbid throat swing emit hey inward blood pillow esteem madame cope under tent hawse glory muscle order bruise bold dad get carpet talk"
    And click Unlock Wallet
    Then I should see "Unlocking wallet..." on the page
    And I should then see my wallet address "Q01050058bb3f8cb66fd90d0347478e5bdf3a475e82cfc5fe5dc276500ca21531e6edaf3d2d0f7e" on the page
    When I then fill in the to address as "Q02040084c25e7c81ea109853ef474c925a3f6a10ae7ceb5651e26282e5877bd4ce49039fc59bb9"
    And enter the amount as "5"
    And I click Add Another Recipient
    When I then fill in the second to address as "Q000400243b6f4a60669afbb192a04157822da2dfb1d0f1b99856df6f6948b1704a5fc552c4e3f8"
    And enter the second amount as "10"
    And enter the fee as "0.005"
    And change the OTS Key Index to "10"
    And click confirm
    And I should then see a form confirming my transaction
    When I then click confirmation transaction
    Then I should see "Your transaction is being relayed into the QRL network..."
    And I should see shortly after "Success! Your transaction has been relayed into the QRL network through the following nodes, and is pending validation."
    And I should "Transaction Status: Pending"
    And shortly after I should see "Transaction Status: Complete - Transaction"
